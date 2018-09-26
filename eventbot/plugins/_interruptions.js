module.exports = function(bot) {
    // Test to see if the user is trying to cancel by saying "cancel"
    bot.interruption(async (dc) => {
        return bot.hears(['cancel', 'quit', 'exit'], dc);
    }, async (dc) => {
        // Check to see if there is anything to cancel.
        if (dc.activeDialog) {
            await dc.context.sendActivity(`OK, I canceled that operation.`);
            return await dc.cancelAllDialogs();
        } else {
            return await dc.context.sendActivity(`There was nothing for me to cancel.`);
        }
    });

    // Test to see if the user is trying to get help by saying "help"
    bot.interruption(async (dc) => {
        return bot.hears(['help'], dc);
    }, async (dc) => {
        if (dc.activeDialog) {
            // TODO: Traverse dc.stack to find a dialog that is in our help dictionary.
            dc.stack.forEach(function(dialog) {
                console.log('parent dialog == ', dialog.id);
            });
            return await dc.context.sendActivity(`Do you need help with ${ dc.activeDialog.id }?`);
        } else {
            return await dc.context.sendActivity(`You need some help eh?`);
        }
    });
};
