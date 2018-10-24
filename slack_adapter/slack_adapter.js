const { ActivityTypes, BotAdapter, TurnContext, MiddlewareSet } = require('botbuilder');
const { WebClient } = require('@slack/client');

class SlackAdapter extends BotAdapter {
    // TODO: Define options
    constructor(options) {
        super();
        this.options = options;
        // console.log('BOOTED SLACK ADAPTER', this.options);
        if (!this.options.verificationToken) {
            throw new Error('Required: include a verificationToken to verify incoming Events API webhooks');
        }

        if (this.options.botToken) {
            this.slack = new WebClient(this.options.botToken);
            this.slack.auth.test().then((identity) => {
                console.log('** Slack adapter running in single team mode.');
                this.identity = identity;
                console.log('My Slack identity: ', identity.user,'on team',identity.team);
            }).catch((err) => {
                // This is a fatal error! Invalid credentials have been provided and the bot can't start.
                console.error(err);
                process.exit(1);
            });
        } else if (!this.options.getTokenForTeam) {
            // This is a fatal error. No way to get a token to interact with the Slack API.
            console.error('Missing Slack API credentials! Provide either a botToken or a getTokenForTeam() function as part of the SlackAdapter options.');
            process.exit(1);
        } else if (!this.options.clientId || !this.options.clientSecret || !this.options.scopes || !this.options.redirectUri) {
            // This is a fatal error. Need info to connet to Slack via oauth
            console.error('Missing Slack API credentials! Provide clientId, clientSecret, scopes and redirectUri as part of the SlackAdapter options.');
            process.exit(1);
        } else {
            console.log('** Slack adapter running in multi-team mode.');
        }
    }

    async getAPI(activity) {
        // TODO: use activity.channelId (the slack team id) and get the appropriate token using getTokenForTeam
        if (this.slack) {
            return this.slack;
        } else {
            const token = await this.options.getTokenForTeam(activity.channelId);
            return new WebClient(token);
        }
    }

    getInstallLink() {
        const redirect = 'https://slack.com/oauth/authorize?client_id=' + this.options.clientId + '&scope=' + this.options.scopes.join(',');
        return redirect;
    }

    async validateOauthCode(code) {
        const slack = new WebClient();
        const results = await slack.oauth.access({
            code: code,
            client_id: this.options.clientId,
            client_secret: this.options.clientSecret,
            redirect_uri: this.options.redirectUri
        });
        if (results.ok) {
            return results;
        } else {
            // TODO: What should we return here?
            throw new Error(results.error);
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
                    const slack = await this.getAPI(context.activity);
                    const result = await slack.chat.postMessage(message);
                    if (result.ok === true) {
                        responses.push({
                            id: result.ts,
                            activityId: result.ts,
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

    async updateActivity(context, activity) {
        if (activity.activityId && activity.conversation) {
            try {
                const message = this.activityToSlack(activity);

                // set the id of the message to be updated
                message.ts = activity.activityId;
                const slack = await this.getAPI(context.activity);
                const results = await slack.chat.update(message);
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
        if (reference.activityId && reference.conversation) {
            try {
                const slack = await this.getAPI(context.activity);
                const results = await slack.chat.delete({ ts: reference.activityId, channel: reference.conversation });
                if (!results.ok) {
                    console.error('Error deleting activity:', results);
                }
            } catch (err) {
                console.error('Error deleting activity', err);
                throw new Error(err);
            }
        } else {
            throw new Error('Cannot delete activity: reference is missing activityId');
        }
    }

    async continueConversation(reference, logic) {
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

        // console.log('GOT SLACK EVENT', event);
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
                // console.log('GOT INTERACTIVE MESSAGE (button click, dialog submit, other)');
                console.log(JSON.stringify(event, null, 2));

                const activity = {
                    timestamp: new Date(),
                    channelId: event.team.id,
                    conversation: event.channel.id,
                    from: event.user.id,
                    // recipient: this.identity.user_id,
                    channelData: event,
                    type: ActivityTypes.Event
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
        } else if (event.type === 'event_callback') {
            // this is an event api post
            if (event.token !== this.options.verificationToken) {
                console.error('Rejected due to mismatched verificationToken:', event);
                res.status(403);
                res.end();
            } else {
                const activity = {
                    id: event.event.ts,
                    timestamp: new Date(),
                    channelId: event.team_id,
                    conversation: event.event.channel,
                    from: event.event.user, // TODO: bot_messages do not have a user field
                    recipient: event.api_app_id,
                    channelData: event.event,
                    type: ActivityTypes.Event
                };

                // If this is conclusively a message originating from a user, we'll 
                if (event.event.type === 'message' && !event.event.subtype) {
                    activity.type = ActivityTypes.Message;
                    activity.text = event.event.text;
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

class SlackEventMiddleware extends MiddlewareSet {

    async onTurn(context, next) {
        if (context.activity.type === ActivityTypes.Event && context.activity.channelData) {
            // Handle message sub-types
            if (context.activity.channelData.subtype) {
                context.activity.type = context.activity.channelData.subtype;
            } else if (context.activity.channelData.type) {
                context.activity.type = context.activity.channelData.type;
            }
        }
        await next();
    }
}

class SlackIdentifyBotsMiddleware extends MiddlewareSet {
    async onTurn(context, next) {
        // prevent bots from being confused by self-messages.
        // PROBLEM: we don't have our own bot_id!
        // SOLUTION: load it up and compare!
        // TODO: perhaps this should be cached somehow?
        // TODO: error checking on this API call!
        if (context.activity.channelData && context.activity.channelData.bot_id) {
            const slack = await context.adapter.getAPI(context.activity);
            const bot_info = await slack.bots.info({ bot: context.activity.channelData.bot_id });
            context.activity.from = bot_info.bot.user_id;

            // TODO: it is possible here to check if this is a message originating from THIS APP because bot_info has an app_id and the event also has one.
        }

        // // TODO: getting identity out of adapter is brittle!
        // if (context.activity.from === context.adapter.identity.user_id) {
        //     context.activity.type = 'self_' + context.activity.type;
        // }

        await next();
    }
}

module.exports.SlackAdapter = SlackAdapter;
module.exports.SlackEventMiddleware = SlackEventMiddleware;
module.exports.SlackIdentifyBotsMiddleware = SlackIdentifyBotsMiddleware;