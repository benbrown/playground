const { ComponentDialog, WaterfallDialog, TextPrompt } = require('botbuilder-dialogs');

module.exports = function(bot) {

    const fancy = new FancyDialog('fancy');
    bot.addDialog(fancy);

    fancy.toot();

    bot.handle((dc) => {
        return (dc.context.activity.type == 'message' && dc.context.activity.text && dc.context.activity.text.toLowerCase().includes('fancy'));
    }, async (dc) => {
        return await dc.beginDialog('fancy');
    });
}

class FancyDialog extends ComponentDialog {
    constructor(dialogId) {
        super(dialogId);

        this.addDialog(new WaterfallDialog('start', [
            async (step) => {
                await step.context.sendActivity('This is a component dialog');
                return await step.next();
            },
            async (step) => {
                return await step.prompt('textPrompt', 'This is a text prompt!');
            },
            async (step) => {
                return await step.prompt('textPrompt', 'This is another text prompt!');
            },
            async (step) => {
                await step.context.sendActivity('Done with fancy component dialog');
                return await step.endDialog();
            }
        ]));

        this.addDialog(new TextPrompt('textPrompt'));

    }

    toot() {
        console.log('THIS IS TOOT', this.dialogs);

    }
}