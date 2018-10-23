const { ActivityTypes, BotAdapter, TurnContext } = require('botbuilder');
const { WebClient } = require('@slack/client');

class SlackAdapter extends BotAdapter {
    // TODO: Define options
    constructor(options) {
        super();
        this.options = options;
        console.log('BOOTED SLACK ADAPTER', this.options);
        if (!this.options.verificationToken) {
            throw new Error('Required: include a verificationToken to verify incoming Events API webhooks');
        }

        if (this.options.botToken) {
            this.slack = new WebClient(this.options.botToken);

            this.slack.auth.test().then((identity) => {
                this.identity = identity;
                console.log('My identity: ', identity);
            });
        } else if (!this.options.getTokenForTeam) {

        }
    }

    activityToSlack(activity) {
        const message = {
            channel: activity.conversation,
            text: activity.text
        };

        // if channelData is specified, overwrite any fields in message object
        if (activity.channelData) {
            Object.keys(activity.channelData).forEach(function(key) {
                message[key] = activity.channelData[key];
            });
        }

        return message;
    }

    async sendActivities(context, activities) {
        const responses = [];
        for (var a = 0; a < activities.length; a++) {
            const activity = activities[a];
            if (activity.type === ActivityTypes.Message) {
                const message = this.activityToSlack(activity);

                try {
                    const result = await this.getAPI(context.activity).chat.postMessage(message);
                    console.log('RESULT OF POST', result);
                    if (result.ok === true) {
                        responses.push({
                            id: result.ts,
                            conversation: result.channel,
                        });
                    } else {
                        console.error('Error sending activity to Slack:', result);
                    }
                } catch (err) {
                    console.error('Error sending activity to Slack:', err);                    
                }
            } else {
                // TODO: Handle sending of other types of message?
            }
        }

        return responses;
    }

    getAPI(activity) {
        // TODO: use activity.channelId (the slack team id) and get the appropriate token using getTokenForTeam
        return this.slack;
    }

    async updateActivity(context, activity) {
        if (activity.id) {
            console.log('UPDATE ACTIVITY', activity);
            try {
                const message = this.activityToSlack(activity);

                // set the id of the message to be updated
                message.ts = activity.id;

                console.log('MESSAGE TO UPDATE', message);

                const results = await this.getAPI(context.activity).chat.update(message);
                if (!results.ok) {
                    console.error('Error updating activity on Slack:', results);
                }

            } catch (err) {
                console.error('Error updating activity on Slack:', err);
            }

        } else {
            throw new Error('Cannot update activity: activity is missing id');
        }
    }

    async deleteActivity(context, reference) {
        if (reference.activityId) {
            // call chat.delete
            try {
                const results = await this.getAPI(context.activity).chat.delete({ ts: reference.activityId, channel: reference.conversation });
                console.log('Result of delete activity:', results);
            } catch (err) {
                console.error('Error deleting activity', err);
                throw new Error(err);
            }
        } else {
            throw new Error('Cannot delete activity: reference is missing activityId');
        }
    }

    async continueConversation(reference, logic) {
        console.log('ATTEMPTING TO CONTINUE CONVERSATION');
        const request = TurnContext.applyConversationReference(
            { type: 'event', name: 'continueConversation' },
            reference,
            true
        );
        const context = new TurnContext(this, request);

        return this.runMiddleware(context, logic);
    }

    async processActivity(req, res, logic) {
        // Create an Activity based on the incoming message from Slack.
        // There are a few different types of event that Slack might send.
        let event = req.body;

        console.log('GOT SLACK EVENT', event);
        if (event.type === 'url_verification') {
            res.status(200);
            res.send(event.challenge);
        } else if (event.payload) {
            event = JSON.parse(event.payload);
            if (event.token !== this.options.verificationToken) {
                console.error('Rejected due to mismatched verificationToken:', event);
                res.status(403);
                res.end();
            } else {
                console.log('GOT INTERACTIVE MESSAGE (button click, dialog submit, other)');
                // console.log(JSON.stringify(event, null, 2));

                const activity = {
                    timestamp: new Date(),
                    channelId: event.team.id,
                    conversation: event.channel.id,
                    from: event.user.id,
                    recipient: this.identity.user_id,
                    channelData: event,
                    type: event.type
                };

                // create a conversation reference
                const context = new TurnContext(this, activity);

                // send http response back
                // TODO: Dialog submissions have other options including HTTP response codes
                res.status(200);
                res.end();

                this.runMiddleware(context, logic)
                    .catch((err) => { this.printError(err.toString()); });
            }
        } else if (event.event) {
            // this is an event api post
            if (event.token !== this.options.verificationToken) {
                console.error('Rejected due to mismatched verificationToken:', event);
                res.status(403);
                res.end();
            } else {
                const activity = {
                    id: event.event.ts, // TODO: is this the right field?
                    timestamp: new Date(),
                    channelId: event.team_id,
                    conversation: event.event.channel,
                    from: event.event.user,
                    recipient: event.api_app_id,
                    channelData: event
                };

                if (event.event.type === 'message') {
                    activity.type = ActivityTypes.Message;
                    activity.text = event.event.text;

                    // TODO: better handle message sub_type fields
                    if (event.event.subtype) {
                        activity.type = event.event.subtype;
                    }

                } else {
                    activity.type = event.event.type;
                }


                // prevent bots from being confused by self-messages.
                // PROBLEM: we don't have our own bot_id!
                // SOLUTION: load it up and compare!
                // TODO: perhaps this should be cached somehow?
                // TODO: error checking on this API call!
                if (event.event.bot_id) {
                    const bot_info = await this.getAPI(activity).bots.info({ bot: event.event.bot_id });
                    if (bot_info.bot.app_id === event.api_app_id) {
                        activity.from = bot_info.bot.user_id;
                    }
                }

                if (activity.from === this.identity.user_id) {
                    activity.type = 'self_' + activity.type;
                }

                // create a conversation reference
                const context = new TurnContext(this, activity);

                // send http response back
                res.status(200);
                res.end();

                this.runMiddleware(context, logic)
                    .catch((err) => { this.printError(err.toString()); });
            }
        } else {
            console.error('Unknown Slack event type: ', event);
        }
    }
}

module.exports.SlackAdapter = SlackAdapter;
