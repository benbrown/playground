# Experimental Bot Classes

NOTE: This has to be run against [this branch](https://github.com/Microsoft/botbuilder-js/pull/499) of Botbuilder-js,
which contains @steveinc's latest `consultDialog` methods. To do that, check out botbuilder-js, check out steve's branch,
build the libraries, then run `npm link` in libraries/botbuilder and libraries/botbuilder-core and libraries/botbuilder-dialogs.

Then, from inside this project, run `npm link botbuilder ; npm link botbuilder-core ; npm link botbuilder-dialogs`

## EventBotComposable

This is a "Bot runner" class that exposes a `.run` method for handling an incoming turn. The run method
handles the boilerplate of creating a dialog turn context, running continue, and saving changes to state.
This class is based on ComponentDialog, so it has its own internal dialog stack, and can be added to other
dialog sets.

In addition to doing the boilerplate, this class does some potentially really cool things:

### Define interrupts which should fire BEFORE any active dialogs continue:

EventBot has an `interrupt()` function that allows developers to register interrupts
that will be evaluated before the active dialog continues.

```
// interrupt takes a async test and an async handler
// bot.interrupt(test_function, handler_function);

bot.interrupt(async (dc) => {
    // perform a test on the incoming dc.
    if (dc.context.activity.type == 'message' && dc.context.activity.text.includes('help')) {
        return true;
    }
    return false;
}, async (dc) => {
    // take an action if the test returns true
    await dc.context.sendActivity('You need help!');

});
```

### Define triggers to watch for, and their respective handlers:

EventBot has an `handle()` function that allows developers to register triggers
that will be evaluated if there is no active dialog (or the active dialog did not do anything).

```
// handke takes a async test and an async handler
// bot.handle(test_function, handler_function);

bot.handle(async (dc) => {
    // perform a test on the incoming dc.
    if (dc.context.activity.type == 'message' && dc.context.activity.text.includes('reboot')) {
        return true;
    }
    return false;
}, async (dc) => {
    // take an action!
    await dc.context.sendActivity('I will reboot the bot');
});
```

### Handle incoming events:

### Automatically load a bunch of handlers:

EventBot has a `loadPlugins` method that will load all the modules in folder and pass in the bot object
as a paramter. This allows the plugins to register handlers, create dialogs, and do other stuff using the methods above.

```
bot.loadPlugins(path);
```

### Merge multiple child Eventbots into a single one:


## ScriptedDialog

