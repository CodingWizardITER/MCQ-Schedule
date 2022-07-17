const { message } = require("./config");
const { set } = require("lodash");
const telegram_api = require("node-telegram-bot-api");

class telegram {
    constructor() {
        ({
            BOT_TOKEN: this.bot_token,
            GROUP_CHAT_ID: this.chat_id,
            ADMIN_CHAT_ID: this.admin_chat_id,
        } = process.env) && this.setup();
    }

    setup() {
        this.bot = new telegram_api(this.bot_token, { polling: false });
    }

    fake_url(url) {
        return url.replace(
            /http(s)?:\/\/localhost:[0-9]*/,
            "https://google.co.in"
        );
    }
    
    async create_quiz(mention, view_url) {
        const message_obj = await this.bot.sendMessage(
            `-100${this.admin_chat_id}`,
            message.NEW_QUESTION(mention),
            {
                parse_mode: "HTML",
                reply_markup: set({}, "inline_keyboard[0]", [
                    {
                        text: "View",
                        url: this.fake_url(view_url),
                    },
                ]),
            }
        );

        return message_obj.message_id;
    }

    async edit_quiz(mention, message_id) {
        await this.bot.sendMessage(
            `-100${this.admin_chat_id}`,
            message.EDIT_QUESTION(mention),
            {
                parse_mode: "HTML",
                reply_to_message_id: message_id,
            }
        );
    }

    async review_quiz_approve(mention, message_id) {
        await this.bot.sendMessage(
            `-100${this.admin_chat_id}`,
            message.APPROVE_QUESTION(mention),
            {
                parse_mode: "HTML",
                reply_to_message_id: message_id,
            }
        );
    }

    async review_quiz_decline(mention, message_id) {
        await this.bot.sendMessage(
            `-100${this.admin_chat_id}`,
            message.DECLINE_QUESTION(mention),
            {
                parse_mode: "HTML",
                reply_to_message_id: message_id,
            }
        );

        await this.bot.editMessageReplyMarkup(null, {
            chat_id: `-100${this.admin_chat_id}`,
            message_id,
        });
    }

    async send_quiz_with_code(
        url,
        question,
        options,
        correct_option_id,
        explanation,
        screenshot
    ) {
        const sendPhoto = await this.bot.sendPhoto(
            `-100${this.chat_id}`,
            screenshot
        );

        const reply_to_message_id = sendPhoto.message_id;
        const sendPoll = await this.bot.sendPoll(
            `-100${this.chat_id}`,
            question,
            options,
            {
                is_anonymous: false,
                reply_to_message_id,
                correct_option_id,
                explanation,
                type: "quiz",
                reply_markup: set({}, "inline_keyboard[0]", [
                    {
                        text: "View",
                        url: this.fake_url(url),
                    },
                ]),
            }
        );

        await this.bot.sendMessage(
            `-100${this.admin_chat_id}`,
            `New Question published on telegram:`
        );

        await this.bot.forwardMessage(
            `-100${this.admin_chat_id}`,
            `-100${this.chat_id}`,
            sendPhoto.message_id
        );

        await this.bot.forwardMessage(
            `-100${this.admin_chat_id}`,
            `-100${this.chat_id}`,
            sendPoll.message_id
        );

        return sendPoll.poll.id;
    }

    async send_quiz_without_code(
        url,
        question,
        options,
        correct_option_id,
        explanation
    ) {
        const sendPoll = await this.bot.sendPoll(
            `-100${this.chat_id}`,
            question,
            options,
            {
                is_anonymous: false,
                correct_option_id,
                explanation,
                type: "quiz",
                reply_markup: set({}, "inline_keyboard[0]", [
                    {
                        text: "View",
                        url: this.fake_url(url),
                    },
                ]),
            }
        );

        await this.bot.sendMessage(
            `-100${this.admin_chat_id}`,
            `New Question published on telegram:`
        );

        await this.bot.forwardMessage(
            `-100${this.admin_chat_id}`,
            `-100${this.chat_id}`,
            sendPoll.message_id
        );

        return sendPoll.poll.id;
    }
}

module.exports = telegram;
