module.exports = function(bot) {

    bot.handle(async (dc) => {
        return (dc.context.activity.type == 'message' && dc.context.activity.text && dc.context.activity.text.toLowerCase().includes('type'));
    }, async (dc) => {
        await sleep(5000);
        await dc.context.sendActivity('... ok');
    });

    async function sleep(ms) {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }

}
