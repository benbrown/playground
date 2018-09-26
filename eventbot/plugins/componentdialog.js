const { ComponentDialog, WaterfallDialog, TextPrompt } = require('botbuilder-dialogs');

module.exports = function(bot) {

    bot.addDialog(new FancyDialog('fancy'));

    bot.handle((dc) => {
        return (dc.context.activity.text.toLowerCase().includes('fancy'));
    }, async(dc) => {
        dc.beginDialog('fancy');
    });

}


class FancyDialog extends ComponentDialog {
    constructor(dialogId) {
        super(dialogId);

        this.addDialog(new WaterfallDialog('start', [
            async (step) => {
                return await step.context.sendActivity('This is a component dialog');
            }
        ]))
    }
}