const { TextPrompt } = require('botbuilder-dialogs');
const { ScriptedDialog } = require('../classes/scripted_dialog');

module.exports = function(bot) {
    // Test to see if the user is trying to cancel by saying "cancel"
    bot.handle(async (dc) => {
        return (dc.context.activity.text.toLowerCase().includes('hi'));
    }, async (dc) => {
        return await dc.beginDialog('hello');
    });

    bot.addDialog(new ScriptedDialog('hello', '../scripts/greeting.json', async function(dc, values) {
        // use one of the returned values.
        await dc.context.sendActivity(`You are "${ values.doing_how }"`);
    }));

    // bot.addDialog(new WaterfallDialog('hello', [
    //     async (step) => {
    //         await step.prompt('textPrompt','Hi! How are you?');
    //     },
    //     async (step) => {
    //         const res = step.result;
    //         step.values['status'] = res;
    //         await step.context.sendActivity(`You are "${ res }"`);
    //         return await step.endDialog(step.values);
    //     }
    // ]));

    bot.addDialog(new TextPrompt('textPrompt'));
};
