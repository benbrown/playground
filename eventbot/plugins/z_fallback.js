const { ActivityTypes } = require('botbuilder');

module.exports = function(bot) {
    bot.on(ActivityTypes.Message, async (dc) => {
        const utterance = dc.context.activity.text || '';
        return await dc.context.sendActivity(`I heard "${ utterance }"`);
    });
};
