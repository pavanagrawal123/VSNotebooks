import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";

import { Card } from "neuron-ipe-types";
import {Event, EventEmitter} from "vscode";

/**
 * Class which manages the webview component used by the extension.
 * The class includes utilities to:
 * - Create a webview.
 * - Communicate events to the webview.
 * - Show the webview.
 */
export class WebviewController {
    /**
     * Contains the webview panel.
     */
    public panel: vscode.WebviewPanel | undefined = undefined;

    /**
     * Event triggered when the webview is closed.
     */
    private _onDisposed: EventEmitter<void> = new EventEmitter();
    get onDisposed(): Event<void> { return this._onDisposed.event; }

    /**
     * Event triggered when a card is moved up.
     */
    private _onMoveCardUp: EventEmitter<number> = new EventEmitter();
    get onMoveCardUp(): Event<number> { return this._onMoveCardUp.event; }

    /**
     * Event triggered when a card is moved down.
     */
    private _onMoveCardDown: EventEmitter<number> = new EventEmitter();
    get onMoveCardDown(): Event<number> { return this._onMoveCardDown.event; }

    /**
     * Event triggered when a card is deleted.
     */
    private _onDeleteCard: EventEmitter<number> = new EventEmitter();
    get onDeleteCard(): Event<number> { return this._onDeleteCard.event; }

    /**
     * Event triggered when the title of a card is changed.
     */
    private _onChangeTitle: EventEmitter<{index: number, newTitle: string}> = new EventEmitter();
    get onChangeTitle(): Event<{index: number, newTitle: string}> { return this._onChangeTitle.event; }

    /**
     * Event triggered when the source code of a card is collapsed.
     */
    private _onCollapseCode: EventEmitter<{index: number, value: boolean}> = new EventEmitter();
    get onCollapseCode(): Event<{index: number, value: boolean}> { return this._onCollapseCode.event; }

    /**
     * Event triggered when the output of a card is collapsed.
     */
    private _onCollapseOutput: EventEmitter<{index: number, value: boolean}> = new EventEmitter();
    get onCollapseOutput(): Event<{index: number, value: boolean}> { return this._onCollapseOutput.event; }

    /**
     * Event triggared when a card is collapsed.
     */
    private _onCollapseCard: EventEmitter<{index: number, value: boolean}> = new EventEmitter();
    get onCollapseCard(): Event<{index: number, value: boolean}> { return this._onCollapseCard.event; }

    /**
     * Event triggered when a custom card (markdown cards in the current implementation)
     * is added.
     */
    private _onAddCustomCard: EventEmitter<Card> = new EventEmitter();
    get onAddCustomCard(): Event<Card> { return this._onAddCustomCard.event; }

    /**
     * Event triggared when a custom card (markdown cards) is edited.
     */
    private _onEditCustomCard: EventEmitter<{index: number, card: Card}> = new EventEmitter();
    get onEditCustomCard(): Event<{index: number, card: Card}> { return this._onEditCustomCard.event; }

    /**
     * Event triggered when the user exports cards to a .ipynb file.
     */
    private _onJupyterExport: EventEmitter<number[]> = new EventEmitter();
    get onJupyterExport(): Event<number[]> { return this._onJupyterExport.event; }

    /**
     * Event triggered when a card is opened in the browser.
     */
    private _onOpenInBrowser: EventEmitter<number> = new EventEmitter();
    get onOpenInBrowser(): Event<number> { return this._onOpenInBrowser.event; }

    /**
     * Event triggared when the undo deletion button is pressed in the frontend.
     */
    private _undoClicked: EventEmitter<number> = new EventEmitter();
    get undoClicked(): Event<number> { return this._undoClicked.event; }

    /**
     * Event triggared when a list of selected cards is deleted.
     */
    private _onDeleteSelectedCards: EventEmitter<number[]> = new EventEmitter();
    get onDeleteSelectedCards(): Event<number[]> { return this._onDeleteSelectedCards.event; }

    /**
     * Event triggared when a pdf output is saved by the user.
     */
    private _onSavePdf: EventEmitter<string> = new EventEmitter();
    get onSavePdf(): Event<string> { return this._onSavePdf.event; }

    constructor(private context: vscode.ExtensionContext) {}

    /**
     * Show the webview.
     * If the webview has already been initialised, it is simply revealed.
     * Otherwise it is generated and the frontend interface is opened;
     * the communication messages triggered by user interaction
     * and code execution are also defined.
     */
    public show() {
        if (this.panel) {
            // If we already have a panel, show it in the target column
            this.panel.reveal(vscode.ViewColumn.Two);
        } else {
            this.panel = vscode.window.createWebviewPanel(
                "outputPane",
                "Output pane",
                vscode.ViewColumn.Two,
                {
                    enableScripts: true,
                    localResourceRoots: [vscode.Uri.file(this.context.extensionPath)],
                    retainContextWhenHidden: true,
                },
            );
            // Open the frontend interface in the webview
            const htmlFile = path.join(this.context.extensionPath, "html", "index.html");
            const basePath = vscode.Uri.file(this.context.extensionPath).with({ scheme: "vscode-resource" });
            let htmlSource = fs.readFileSync(htmlFile, "utf-8");
            htmlSource = htmlSource.replace('<base href="">', '<base href="' + basePath.toString() + '/html/">');

            this.panel.webview.html = htmlSource;

            // Reset when the current panel is closed
            this.panel.onDidDispose(() => {
                this.panel = undefined;
                this._onDisposed.fire();
            }, null, this.context.subscriptions);

            // Process the messages received from the frontend and trigger the relevant events.
            this.panel.webview.onDidReceiveMessage((message) => {
                switch (message.command) {
                    case "moveCardUp":
                        this._onMoveCardUp.fire(message.index);
                        break;
                    case "moveCardDown":
                        this._onMoveCardDown.fire(message.index);
                        break;
                    case "deleteCard":
                        this._onDeleteCard.fire(message.index);
                        break;
                    case "changeTitle":
                        this._onChangeTitle.fire({index: message.index, newTitle: message.newTitle});
                        break;
                    case "collapseCode":
                        this._onCollapseCode.fire({index: message.index, value: message.value});
                        break;
                    case "collapseOutput":
                        this._onCollapseOutput.fire({index: message.index, value: message.value});
                        break;
                    case "collapseCard":
                        this._onCollapseCard.fire({index: message.index, value: message.value});
                        break;
                    case "addCustomCard":
                        this._onAddCustomCard.fire(message.card);
                        break;
                    case "editCustomCard":
                        this._onEditCustomCard.fire({index: message.index, card: message.card});
                        break;
                    case "jupyterExport":
                        this._onJupyterExport.fire(message.indexes);
                        break;
                    case "openInBrowser":
                        this._onOpenInBrowser.fire(message.index);
                        break;
                    case "deleteSelectedCards":
                        this._onDeleteSelectedCards.fire(message.indexes);
                        break;
                    case "undoClicked":
                        this._undoClicked.fire();
                        break;
                    case "savePdf":
                        this._onSavePdf.fire(message.pdf);
                        break;
                }
            });
        }
    }

    /**
     * Add a card to the frontend by posting a message to the webview.
     * @param card  Card to add to the frontend.
     */
    public addCard(card: Card) {
        if (this.panel) { this.panel.webview.postMessage({
            command: "add-card",
            card,
        });
        }
    }

}
