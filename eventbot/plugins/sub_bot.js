const { EventBot } = require('../classes/EventBotComposable');
const { Dialog, WaterfallDialog, TextPrompt } = require('botbuilder-dialogs');

module.exports = function(bot) {

    var childbot = new EventBot('childbot');

    childbot.interruption(
        async (dc) => {
            return bot.hears(['help'], dc);
        },
        async (dc) => {
            await dc.context.sendActivity('This is help for a child bot component');
            return Dialog.EndOfTurn;
        }
    );

    childbot.interruption(
        async (dc) => {
            return bot.hears(['poot'], dc);
        },
        async (dc) => {
            await dc.context.sendActivity('POOOOT!');
            return Dialog.EndOfTurn;
        }
    );

    childbot.addDialog(new WaterfallDialog('foobar', [
        async (step) => {
            return await step.prompt('textPrompt', 'Prompt 1');
        },
        async (step) => {
            return await step.prompt('textPrompt', 'Prompt 2');
        },
        async (step) => {
            return await step.prompt('textPrompt', 'Prompt 3');
        },
        async (step) => {
            return await step.endDialog();
        }
    ]));

    childbot.addDialog(new TextPrompt('textPrompt'));

    bot.addDialog(childbot);

    bot.handle(async(dc) => {
        return bot.hears(['child'], dc);
    }, async(dc) => {
        return await dc.beginDialog('childbot');
    });

}