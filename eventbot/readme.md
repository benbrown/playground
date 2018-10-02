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


### Define triggers to watch for, and their respective handlers:


### Handle incoming events:


### Merge multiple child Eventbots into a single one:


## ScriptedDialog

