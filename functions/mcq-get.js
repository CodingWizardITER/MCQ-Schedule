const {
    map,
    last,
    take,
    omit,
    pick,
    find,
    compact,
    matches,
    entries,
} = require("lodash");
const moment = require("moment");
const validate = require("./utils/validate");
const configs = require("./files/configs.json");
const { database } = require("./utils/firebase");
const timetable = require("./files/timetable.json");
const { error } = require("./utils/string");
const base = require("./utils/base");

exports.handler = async (event, _context) => {
    const main = new mcq_get(event);
    return main.execute();
};

class mcq_get extends base {
    #error(message) {
        throw new Error(message);
    }

    async execute() {
        await this.authenticate();

        switch (this.path) {
            case "/mcq-get/schedule":
                return this.#schedule();
            case "/mcq-get/question":
                return this.#question();
            case "/mcq-get/list":
                return this.#list();
            default:
                return this.resp_404();
        }
    }

    async #schedule() {
        const { value: data, error: err } = validate.validateMCQschedule(
            Object.fromEntries(new URLSearchParams(this.query))
        );

        try {
            let schedule;
            err && this.#error(err);
            !this.auth && this.#error("Unauthorized");
            const collection = database.collection("questions");
            const results = await collection
                .where("week", "==", moment().utcOffset("+05:30").week())
                .where("year", "==", moment().utcOffset("+05:30").year())
                .orderBy("date", "desc")
                .get();

            const result = find(results.docs, (r) =>
                matches({
                    approved: true,
                    topic: data.topic,
                    author: this.user?.code,
                })(r.data())
            );

            result && !this.user?.admin && this.#error(error.ALREADY_POSTED);
            for (const [day, slots] of entries(timetable)) {
                for (const [slot, { topic, assignee }] of entries(slots)) {
                    if (
                        assignee === this.user?.code &&
                        topic === this.query.topic
                    ) {
                        const { startHr } = find(configs.slots, { code: slot });
                        schedule = moment()
                            .utcOffset("+05:30")
                            .hour(startHr)
                            .minute(0)
                            .second(0)
                            .day(day)
                            .unix();
                    }
                }
            }

            !schedule && !this.user?.admin
                ? this.#error(error.NO_SCHEDULE)
                : (schedule = moment().utcOffset("+05:30").second(0).unix());

            return this.resp_200({ schedule });
        } catch (error) {
            return this.resp_500({ error: error.message });
        }
    }

    async #question() {
        const {
            error: err,
            value: { id: docId },
        } = validate.validateMCQQuestion(
            Object.fromEntries(new URLSearchParams(this.query))
        );

        try {
            err && this.#error(err);
            const collection = database.collection("questions");
            const question = await collection.doc(docId).get();

            (!question.exists || !(question.data().approved || this.auth)) &&
                this.#error("Question not found");

            const omitParams = [
                "admin_message_id",
                "correct_option",
                "explanation",
                "screenshot",
                "approved",
                "schedule",
                "poll_id",
                "week",
                "year",
            ];

            const docData = this.auth
                ? question.data()
                : omit(question.data(), omitParams);

            docData.canEdit =
                ((docData.author === this.user?.code && !docData.approved) ||
                    this.user?.admin) &&
                !docData.poll_id;

            Object.assign(docData, { docId });
            return this.resp_200({ response: docData });
        } catch (error) {
            return this.resp_500({error: error.message});
        }
    }

    async #list() {
        const { value: data, error: err } = validate.validateMCQList(
            Object.fromEntries(new URLSearchParams(this.query))
        );

        try {
            err && this.#error(err);
            let questions;
            let body = { response: [], nextPage: false };
            const { week, year, cursor } = data;

            let filter = compact(
                pick(data, [
                    "week",
                    "year",
                    "lang",
                    "topic",
                    "author",
                    "cursor",
                ])
            );

            var questionsRef = database
                .collection("questions")
                .orderBy("date", "desc");

            week &&
                year &&
                (questionsRef = questionsRef
                    .where("week", "==", week)
                    .where("year", "==", year));

            if (!this.auth) filter.approved = true;
            if (!cursor) questions = await questionsRef.get();
            else questions = await questionsRef.startAfter(cursor).get();

            const response = compact(
                map(questions.docs, (question) => {
                    let docData = {},
                        docId = question.id;

                    if (matches(filter)(question.data())) {
                        if (!this.auth) {
                            docData = pick(question.data(), [
                                "docId",
                                "question",
                                "author",
                                "topic",
                                "date",
                            ]);
                        } else docData = question.data();
                        return { docId, ...docData };
                    }
                })
            );

            if (response.length) {
                body.response = week && year ? response : take(response, 10);
                body.count = body.response.length;
                if (response.length > body.response.length) {
                    body.nextPage = true;
                    body.nextCursor = last(body.response).date;
                }
            }

            return this.resp_200(body);
        } catch (error) {
            return this.resp_500({ error: error.message });
        }
    }
}
