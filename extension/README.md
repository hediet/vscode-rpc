# VS Code Remote Interface

This extension adds a JSON RPC remote interface to VS Code.

![Notification](extension/docs/notification.png)

## Features

-   Launches a registrar-server that coordinates how to broadcast and connect to multiple vs code instances.
-   Implements token based security.

    ![Grant or Deny](extension/docs/grant-or-deny.png)

-   See the library [`vscode-rpc`](https://github.com/hediet/vscode-rpc) on npm on how to programmatically control vscode.
-   Supports [easy-attach](https://github.com/hediet/easy-attach) for extremely easy debugging of node applications.

    ![Easy Attach](extension/docs/easy-attach.png)

-   Adds commands for editing and reloading the server config.
-   Provides RPC contracts for
    -   Jumping to a given code span of a given file
    -   Highlighting a given code span
    -   Adding inline widgets

## Easy Attach

![Easy Attach Demo](extension/docs/easy-attach.gif)

## Requirements

-   Port `56024` must be free.

## TODO

-   Virtual Files
-   Browser access (by enabling CORS): So you can forward text areas to VS Code
-   Better documentation
-   Better UI when there are multiple debug targets

## Implementation Details

See [the repository](https://github.com/hediet/vscode-rpc-server).

---
