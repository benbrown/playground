const { ActivityTypes } = require('botbuilder');
const { DialogSet, WaterfallDialog } = require('botbuilder-dialogs');
const fs = require('fs');

/**
 * EventBot is a bot runner class that emits events for incoming messages, and provides mechanisms
 * for handling events and doing some basic trigger matching.
 *
 * This allows developers to create a bot object, then register handlers for various event and triggers
 * through plugins and modules.
 */

// TODO: Should this maybe be based on component dialog? Could make it cool way to compose bots?
module.exports.EventBot = class EventBot {
    constructor(conversationSate, userState) {
        this.conversationState = conversationSate;
        this.userState = userState;

        this.dialogState = this.conversationState.createProperty('dialogState');
        this.dialogs = new DialogSet(this.dialogState);

        this.interruptions = [];
        this.handlers = [];
        this.events = {};
    }

    loadPlugins(path) {
        try {
            var plugins = fs.readdirSync(path);
            plugins.forEach((plugin) => {
                console.log(`* Loading plugin: ${ plugin }`);
                // Load the module, and fire it immediately
                // TODO: Should these return classes?
                var func = require([path, plugin].join('/'));
                func(this);
            });
        } catch (err) {
            throw new Error(err);
        }
    }

    interruption(test, handler) {
        this.interruptions.push({
            test: test,
            handler: handler
        });

        return this;
    }

    handle(test, handler) {
        this.handlers.push({
            test: test,
            handler: handler
        });

        return this;
    }

    hears(patterns, dc) {
        const utterance = dc.context.activity.text || '';
        if (!Array.isArray(patterns)) {
            patterns = [patterns];
        }

        for (var i = 0; i < patterns.length; i++) {
            var test = new RegExp(patterns[i], 'i');
            if (utterance.match(test)) {
                console.log('HEARD ', test, 'IN', utterance);
                return true;
            }
        }
        return false;
    }

    on(event, handler) {
        if (!this.events[event]) {
            this.events[event] = [];
        }
        this.events[event].push(handler);

        return this;
    }

    async trigger(event, dc) {
        if (this.events[event]) {
            for (var i = 0; i < this.events[event].length; i++) {
                const handler = this.events[event][i];
                await handler.call(this, dc);
            }
        }
    }

    addDialog(dialog) {
        this.dialogs.add(dialog);
    }

    async onTurn(turnContext) {
        const dc = await this.dialogs.createContext(turnContext);

        if (turnContext.activity.type === ActivityTypes.Message) {
            let results = null;

            // FIRST CHECK FOR INTERRUPTIONS
            for (var i = 0; i < this.interruptions.length; i++) {
                const interupt = this.interruptions[i];
                let matches = await interupt.test(dc);
                // Call the handler function if matches is true.
                if (matches === true && !dc.context.responded) {
                    results = await interupt.handler.call(this, dc);
                    console.log('results of interupt', results);
                }
            };

            // Continue the current dialog
            if (!dc.context.responded && dc.activeDialog) {
                results = await dc.continueDialog();
                console.log('results of this turn', results);
            }

            if (!dc.context.responded) {
                // TODO:May want to look at results too?

                // Test all the handlers
                for (var i = 0; i < this.handlers.length; i++) {
                    const handler = this.handlers[i];
                    let matches = await handler.test(dc);
                    // Call the handler function if matches is true.
                    if (matches === true && !dc.context.responded) {
                        results = await handler.handler.call(this, dc);
                        console.log('results of handler', results);
                    }
                };
            }

            if (!dc.context.responded) {
                await this.trigger(turnContext.activity.type, dc);
            }
        } else {
            console.log('EMIT AN EVENT ', turnContext.activity.type);
            await this.trigger(turnContext.activity.type, dc);
        }

        // End this turn by saving changes to the state.
        this.conversationState.saveChanges(turnContext);
        this.userState.saveChanges(turnContext);
    }
};
