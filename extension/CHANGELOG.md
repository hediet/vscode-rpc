# Change Log

## 0.1.0

-   Initial release

## 0.13.0

-   Adds a setting to optionally disable startup message
-   Implements the `revealTextContract` that allows RPC clients to reveal a text range of a file.
    The VS Code instance whose workspace contains that file then opens that file and
    highlights the specified range.
-   Updates dependencies.

## 0.13.1

-   Removes dependency to `crypto-hash` and uses `crypto` directly.
    `crypto-hash` does not seem to work any more with newest version of VS Code.
