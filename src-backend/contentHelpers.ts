import { Kernel, KernelMessage, ServerConnection } from "@jupyterlab/services";
import { JSONArray, JSONObject, JSONValue } from "@phosphor/coreutils";
import {Card, CardOutput} from "neuron-ipe-types";

import * as vscode from "vscode";
import {Event, EventEmitter} from "vscode";

/**
 * Static class which handles the processing of the responses from the Jupyter Notebook instance
 * and the consequent creation of the corresponding cards.
 * It also includes utilities for modules import, installation of missing modules and status update.
 */
export class ContentHelpers {
    static get onStatusChanged(): Event<string> { return this._onStatusChanged.event; }
    static get onCardReady(): Event<Card> { return this._onCardReady.event; }

    /**
     * Stores the source code of the card being created.
     */
    public static sourceTmp = "";

    /**
     * Stores the outputs of the card being created.
     */
    public static contentTmp: CardOutput[] = [];

    /**
     * Keeps track of the id to assign to new cards.
     */
    public static id = 0;

    /**
     * Stores the Jupyter Data (used for export to Jupyter Notebook file)
     * of the card being created.
     */
    public static jupyterData: JSONObject = {};

    /**
     * Stores the current kernel being used for code execution.
     * It is changed when the execution of a source code in a
     * different language is required.
     */
    public static currentKernel: string;

    /**
     * Generate a title for a new card based on its id.
     * @param id    Id of the card whose title has to be generated.
     */
    public static makeCardTitle(id: number): string {
        return `Card ${id}`;
    }

    /**
     * Validate json received checking if the fields needed are present.
     * Necessary if strict mode is being used in typescript.
     * @param inputData Input json object.
     * @param field     Field to check in the json object.
     */
    public static validateData(inputData: JSONValue, field: string): inputData is JSONObject {
        return (inputData as JSONObject)[field] !== undefined;
    }

    /**
     * Interpret the message received by the Jupyter Notebook kernel.
     * @param msg           Message received from the kernel.
     * @param kernelName    Name of the kernel being used for code execution.
     */
    public static interpretOutput(msg: KernelMessage.IIOPubMessage, kernelName: string) {
        // Get the Json content of the output
        // let content = msg.content;
        // console.log(msg.content);
        ContentHelpers.processContent(msg);
        this.currentKernel = kernelName;
    }

    /**
     * Process the content present in the kernel message.
     * @param msg   Message received from the Jupyter Notebook kernel.
     */
    public static processContent(msg: KernelMessage.IIOPubMessage) {
        // Process execution state ['busy', 'idle']
        if ("execution_state" in msg.content) {
            const status = msg.content.execution_state;
            if (status === "idle") {
                this.makeCard();
            }
            if (typeof status === "string") {
                this._onStatusChanged.fire(status);
            }
        // Receive back the source code
        } else if ("code" in msg.content) {
            const code = msg.content.code;
            if (typeof code === "string") {
                this.sourceTmp = code;
            }
            this.jupyterData.cell_type = "code";
            this.jupyterData.execution_count = msg.content.execution_count;
            this.jupyterData.source = (msg.content.code as string).split("\n").map((el) => el + "\n");
        // The output is stdout
        } else if ("name" in msg.content) {
            const output = msg.content.text;
            if (typeof output === "string") {
                this.contentTmp.push(new CardOutput("stdout", output));
            }
        // The output is rich
        } else if ("data" in msg.content) {
            const data = msg.content.data;
            this.contentTmp.push(this.interpretRich(data));
        // The code could not be executed, an error was returned
        } else if (["ename", "evalue", "traceback"].every((value) => value in msg.content)) {
            const evalue = msg.content.evalue;
            this.getMissingModule(evalue as string);
            const traceback = (msg.content.traceback as string[]).join("\n");
            this.contentTmp.push(new CardOutput("error", traceback));
        }
        // Generate jupyter data (required for card export) when necessary
        if (!("execution_state" in msg.content) && !("code" in msg.content)) {
            this.jupyterData.metadata = msg.metadata;
            const output = msg.content;
            output.output_type = msg.header.msg_type;
            if ("transient" in output) {
                delete output.transient;
            }
            if (this.jupyterData.outputs) {
                (this.jupyterData.outputs as JSONArray).push(output);
            } else {
                this.jupyterData.outputs = [output];
            }

        }
    }

    /**
     * Process the rich content received.
     * @param data  Json rich data received.
     * @returns     Card output corresponding to the rich data.
     */
    public static interpretRich(data: JSONValue): CardOutput {
        const chosenType = this.chooseTypeFromComplexData(data);
        const output: string = data[chosenType];
        return new CardOutput(chosenType, output);
    }

    /**
     * Ask the user to install missing module if detected in error.
     * @param evalue    Error value received from the kernel.
     */
    public static getMissingModule(evalue: string) {
        const moduleMatch = evalue.match(/No module named \'(.+?)\'/);
        if (moduleMatch) {
            const module = moduleMatch[1].replace(/\'/g, "");
            vscode.window.showInformationMessage(
                "Jupyter requires the module '" + moduleMatch[1] + "' to be installed. Install now?", "Install")
                .then((data) => {
                    if (data) {
                        this.installMissingModule(module);
                    }
                });
        }
    }

    /**
     * Install missing module through pip.
     * @param module    Missing module to install.
     */
    public static installMissingModule(module: string) {
        if (module) {
            const terminal = vscode.window.createTerminal("pip");
            terminal.show();
            terminal.sendText("pip install " + module, true);
        }
    }

    /**
     * Determine the type of the rich data received from the kernel.
     * @param data  Json rich data received from the kernel.
     */
    public static chooseTypeFromComplexData(data: JSONValue) {
        const validDataTypes =
            ["application/vnd.jupyter", "application/vnd.jupyter.cells",
            "application/vnd.jupyter.dragindex", "application/x-ipynb+json",
            "application/geo+json", "application/vnd.plotly.v1+json",
            "application/vdom.v1+json", "text/html", "image/svg+xml",
            "image/png", "image/jpeg", "text/markdown", "application/pdf",
            "text/latex", "application/json", "text/plain"]
            .filter((dataType) => this.validateData(data, dataType));
        return validDataTypes[0];
    }

    /**
     * Create a new card using the class static fields generated
     * and fire the events necessary to send it to the frontend and store it.
     */
    public static makeCard() {
        if (!("metadata" in this.jupyterData) && !("outputs" in this.jupyterData)) {
            this.jupyterData.metadata = {};
            this.jupyterData.outputs = [];
        }

        this._onCardReady.fire(
            new Card(
                this.id,
                this.makeCardTitle(this.id),
                this.sourceTmp,
                this.contentTmp,
                JSON.parse(JSON.stringify(this.jupyterData)),
                this.currentKernel,
            ),
        );

        // Reset static fields after card creation
        this.contentTmp = [];
        this.jupyterData = {};
        this.id++;
    }

    /**
     * Call the addNewCard event with the created card.
     * @param card  Card created.
     */
    public static addNewCard(card: Card) {
        this._onCardReady.fire(card);
    }

    /**
     * Assign id to a newly created card.
     * @returns Id assigned to card.
     */
    public static assignId() {
        return this.id++;
    }

    /**
     * Reset the id field.
     * Called when the output pane is closed and the card arrays are deleted.
     */
    public static resetId() {
        this.id = 0;
    }

    /**
     * Event triggered when the status of the Jupyter Notebook instance changes.
     */
    private static _onStatusChanged: EventEmitter<string> = new EventEmitter();

    /**
     * Event triggered when a card is ready to be send over to the frontend and stored.
     */
    private static _onCardReady: EventEmitter<Card> = new EventEmitter();
}
