import { ActivityTypes, TurnContext, MessageFactory, ActionTypes } from 'botbuilder';
import { Dialog, DialogInstance, DialogSet, DialogReason, TextPrompt } from 'botbuilder-dialogs';
import * as BotkitCMS from 'botkit-studio-sdk';
import { lstat } from 'fs';

export interface BotkitDialogConfig {
    cms_uri: string;
    token: string;
    onComplete?: any;
}

export async function loadAllScripts(config: BotkitDialogConfig, dialogSet: DialogSet) {
    
    const cms = new BotkitCMS({
        studio_command_uri: config.cms_uri,
        studio_token: config.token
    });

    var scripts = await cms.getScripts();

    scripts.forEach((script)=> { 
        let d = new BotkitDialog(script.command, config);
        d.script = script;
        dialogSet.add(d);
    });

}

export class BotkitDialog<O extends object = {}> extends Dialog<O> {

    private onComplete: any;
    public script: any;
    private _config: BotkitDialogConfig;
    private _prompt: string;

    constructor(dialogId: string, config: BotkitDialogConfig, onComplete?) {
        super(dialogId);
    
        this._config = config;

        if (onComplete) {
            this.onComplete = onComplete;
        }

        return this;

    }

    async beginDialog(dc, options) {
        // Initialize the state
        const state = dc.activeDialog.state;
        state.options = options || {};
        state.values = {};

        if (!this.script) {
            // load script from API
            const cms = new BotkitCMS({
                studio_command_uri: this._config.cms_uri,
                studio_token: this._config.token
            });

            const script = await cms.getScript(this.id);
            if (script.command) {
                this.script = script;
            } else {
                throw new Error('No script found with name ' + this.id);
            }

        }
        
        // Add a prompt used for question turns
        if (!this._prompt) {
            this._prompt = this.id + '_default_prompt';
            dc.dialogs.add(new TextPrompt(this._prompt));
        }

        // Run the first step
        return await this.runStep(dc, 0, 'default', DialogReason.beginCalled);
    }

    async continueDialog(dc) {
        
        // Don't do anything for non-message activities
        if (dc.context.activity.type !== ActivityTypes.Message) {
            return Dialog.EndOfTurn;
        }

        // Run next step with the message text as the result.
        return await this.resumeDialog(dc, DialogReason.continueCalled, dc.context.activity.text);
    }

    async resumeDialog(dc, reason, result) {
        // Increment step index and run step
        const state = dc.activeDialog.state;

        return await this.runStep(dc, state.stepIndex + 1, state.thread, reason, result);
    }

    async onStep(dc, step) {

        // Let's interpret the current line of the script.
        const thread = this.script.script.filter(function(thread) {
            return thread.topic === step.thread;
        })[0];

        var line = thread.script[step.index];

        var previous = (step.index >= 1) ? thread.script[step.index - 1] : null;
        // Capture the previous step value if there previous line included a prompt
        if (step.result && previous && previous.collect) {
            if (previous.collect.key) {
                step.values[previous.collect.key] = step.result;
            }

            // handle conditions of previous step
            if (previous.collect.options) {
                var paths = previous.collect.options.filter((option) => { return !option.default===true });
                var default_path = previous.collect.options.filter((option) => { return option.default===true })[0];
                var path = null;

                for (let p = 0; p < paths.length; p++) {
                    let condition = paths[p];
                    let test;
                    if (condition.type==='string') {
                        test = new RegExp(condition.pattern,'i');
                    } else if (condition.type =='regex') {
                        test = new RegExp(condition.pattern,'i');
                    }

                    if (step.result.match(test)) {
                        path = condition;
                        break;
                    }
                }

                // take default path if one is set
                if (!path) {
                    path = default_path;
                }

                switch (path.action) {
                    case 'next':
                        break;
                    case 'complete':
                        step.values._status = 'completed';
                        return await dc.endDialog(step.result);
                        break;
                    case 'stop':
                        step.values._status = 'canceled';
                        return await dc.endDialog(step.result);
                        break;
                    case 'timeout':
                        step.values._status = 'timeout';
                        return await dc.endDialog(step.result);
                        break;
                    case 'execute_script':
                        // todo figure out how to goto thread
                        return await dc.beginDialog(path.execute.script);
                        break;
                    case 'repeat':
                        return await this.runStep(dc, step.index - 1, step.thread, DialogReason.nextCalled);
                        break;
                    case 'wait':
                        console.log('NOT SURE WHAT TO DO WITH THIS!!', line);
                        break;
                    default: 
                        // default behavior for unknown action in botkit is to gotothread
                        if (this.script.script.filter((thread) => { return thread.topic === path.action }).length) {
                            return await this.runStep(dc,0, path.action, DialogReason.nextCalled, step.values);
                        } else {
                            console.log('NOT SURE WHAT TO DO WITH THIS!!', line);
                            break;
                        }
                }

            }

        }

        // If a prompt is defined in the script, use dc.prompt to call it.
        // This prompt must be a valid dialog defined somewhere in your code!
        if (line.collect) {
            try {
                let outgoing;
                if (line.quick_replies) {
                    outgoing = MessageFactory.suggestedActions(line.quick_replies.map((reply) => { return { type: ActionTypes.PostBack, title: reply.title, text: reply.payload, displayText: reply.title, value: reply.payload}; }), line.text[0]);
                } else {
                    outgoing = MessageFactory.text(line.text[0]);
                }

                return await dc.prompt(this._prompt, outgoing); // todo: pick randomly
            } catch (err) {
                console.error(err);
                const res = await dc.context.sendActivity(`Failed to start prompt ${ line.prompt.id }`);
                return await step.next();
            }
        // If there's nothing but text, send it!
        // This could be extended to include cards and other activity attributes.
        } else {
            if (line.text) {
                let outgoing;
                if (line.quick_replies) {
                    outgoing = MessageFactory.suggestedActions(line.quick_replies.map((reply) => { return { type:  ActionTypes.PostBack, title: reply.title, text: reply.payload, displayText: reply.title, value: reply.payload}; }), line.text[0]);
                } else {
                    outgoing = MessageFactory.text(line.text[0]);
                }
                await dc.context.sendActivity(outgoing); // todo: update to pick randomly from options
            }
            
            if (line.action) {
                switch (line.action) {
                    case 'next':
                        break;
                    case 'complete':
                        step.values._status = 'completed';
                        return await dc.endDialog(step.result);
                    case 'stop':
                        step.values._status = 'canceled';
                        return await dc.endDialog(step.result);
                        break;
                    case 'timeout':
                        step.values._status = 'timeout';
                        return await dc.endDialog(step.result);
                        break;
                    case 'execute_script':
                        // todo figure out how to goto thread
                        return await dc.beginDialog(line.execute.script);
                        break;
                    // this can only happen in a conditional
                    // case 'repeat':
                    // console.log('REPEATING!');
                    // return await this.runStep(dc,step.index, step.thread, DialogReason.nextCalled);
                    //     break;
                    case 'wait':
                        console.log('NOT SURE WHAT TO DO WITH THIS!!', line);
                        break;
                    default: 
                        // default behavior for unknown action in botkit is to gotothread
                        if (this.script.script.filter((thread) => { return thread.topic === line.action }).length) {
                            return await this.runStep(dc,0, line.action, DialogReason.nextCalled, step.values);
                        } else {
                            console.log('NOT SURE WHAT TO DO WITH THIS!!', line);
                            break;
                        }
                }
            }

            return await step.next();
        }
    }

    async runStep(dc, index, thread_name, reason, result?) {

        // console.log('CURRENT POS', thread_name, index);

        // Let's interpret the current line of the script.
        const thread = this.script.script.filter(function(thread) {
            return thread.topic === thread_name;
        })[0]; // todo: protect against not found

        
        if (index < thread.script.length) {
            // Update the step index
            const state = dc.activeDialog.state;
            state.stepIndex = index;
            state.thread = thread_name;
            // Create step context
            const nextCalled = false;
            const step = {
                index: index,
                thread: thread_name,
                options: state.options,
                reason: reason,
                result: result,
                values: state.values,
                next: async (stepResult) => {
                    if (nextCalled) {
                        throw new Error(`ScriptedStepContext.next(): method already called for dialog and step '${ this.id }[${ index }]'.`);
                    }

                    return await this.resumeDialog(dc, DialogReason.nextCalled, stepResult);
                }
            };

            // Execute step
            const res = await this.onStep(dc, step);

            return res;
        } else {

            // End of script so just return to parent
            return await dc.endDialog(result);
        }
    }

    async endDialog(context: TurnContext, instance: DialogInstance, reason: DialogReason) {
        console.log('CALLING ONCOMPLETE', instance.state.values);
        if (this.onComplete) {
            console.log('CALLING ONCOMPLETE', instance.state.values);
            return await this.onComplete(context,instance.state.values);
        }
    }
}