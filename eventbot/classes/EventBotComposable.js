const { ActivityTypes } = require('botbuilder');
const { ComponentDialog, DialogSet, DialogTurnStatus } = require('botbuilder-dialogs');
const fs = require('fs');

/**
 * EventBot is a bot runner class that emits events for incoming messages, and provides mechanisms
 * for handling events and doing some basic trigger matching.
 *
 * This allows developers to create a bot object, then register handlers for various event and triggers
 * through plugins and modules.
 */

module.exports.EventBot = class EventBot extends ComponentDialog {
    constructor(dialogId, conversationState, userState) {

        super(dialogId);

        if (conversationState) {
            this.conversationState = conversationState;
            this.dialogState = this.conversationState.createProperty('dialogState');
            this.mainDialogSet = new DialogSet(this.dialogState);
            this.mainDialogSet.add(this);
        }

        if (userState) {
            this.userState = userState;
        }

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
        let results = null;
        if (this.events[event]) {
            for (var i = 0; i < this.events[event].length; i++) {
                const handler = this.events[event][i];
                results = await handler.call(this, dc);
            }
        }

        return results;
    }

     onBeginDialog(innerDC, options) {
        return this.onRunTurn(innerDC, options);
    }

    onContinueDialog(innerDC) {
        return this.onRunTurn(innerDC);
    }

    async onConsultDialog(innerDC) {
        // Does the inner stack want this message?
        const consult = await innerDC.consultDialog();
        if (consult.status === DialogTurnStatus.empty || consult.score <= 0.5) {
            // If not, consult the interrupts at this tier.
            for (var i = 0; i < this.interruptions.length; i++) {
                const interrupt = this.interruptions[i];
                const matched = await interrupt.test(innerDC);
                if (matched) {
                    return {
                        score: 1.0,
                        status: DialogTurnStatus.waiting,
                    }
                }
            }
            return consult;
        } else {
            // The inner dialog wants control.
            return consult;
        }

    }

    async onRunTurn(dc) {

        let results = {status: 'empty'};
        

        // Consult the active dialogs - do you want this?
        const consult = await dc.consultDialog();
        // if the score is low or there is nothing to do, do our own stuff FIRST.
        if (consult.status === DialogTurnStatus.empty || consult.score <= 0.5) {

            for (var i = 0; i < this.interruptions.length; i++) {
                const interupt = this.interruptions[i];
                let matches = await interupt.test(dc);
                // Call the handler function if matches is true.
                if (matches === true && !dc.context.responded) {
                    results = await interupt.handler.call(this, dc);
                    // TODO: REPROMPT?
                }
            };

            if (!dc.context.responded && results.status !== DialogTurnStatus.waiting) {
                results = await dc.continueDialog();
            }

        } else {

            if (!dc.context.responded && results.status !== DialogTurnStatus.waiting) {
                results = await dc.continueDialog();
            }

            // DO WE EVEN WATN TO RUN INTERUPTS IF THIS IS THE cASE? SINCE CHILD DIALOG IS GONNA TAKE THIS?
            for (var i = 0; i < this.interruptions.length; i++) {
                const interupt = this.interruptions[i];
                let matches = await interupt.test(dc);
                // Call the handler function if matches is true.
                if (matches === true && !dc.context.responded) {
                    results = await interupt.handler.call(this, dc);
                    // TODO: REPROMPT?
                }
            };

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
                }
            };
        }

        if (!dc.context.responded) {
            await this.trigger(dc.context.activity.type, dc);
        }
        
        // After all is said and done, if this got triggered but didn't handle anything, start it primary dialog
        if (!this.mainDialogSet && results.status === DialogTurnStatus.empty) {
            // this is a child of the main bot
            // sooooooooooooo we want to uhhh...
            // stsart its main dialog?
            results = await dc.beginDialog(this.initialDialogId);
        }

        return results;

    }

    async run(turnContext) {
        if (!this.mainDialogSet) {
            throw new Error('Calling run on a bot that is not the main bot is bad and wrong!');
        }

        const dc = await this.mainDialogSet.createContext(turnContext);

        if (turnContext.activity.type === ActivityTypes.Message) {
            let results = null;

            results = await dc.continueDialog();

            // Start the main dialog if there wasn't a running one
            if (results.status === DialogTurnStatus.empty) {
                results = await dc.beginDialog(this.id);
            }

        } else {
            await this.trigger(turnContext.activity.type, dc);
        }

        // End this turn by saving changes to the state.
        this.conversationState.saveChanges(turnContext);
        this.userState.saveChanges(turnContext);
    }
};
