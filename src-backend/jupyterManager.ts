import { spawn, ChildProcess, execSync, exec } from 'child_process';
import { URL } from 'url';
import * as vscode from 'vscode';

/**
 * Class which manages the creation, deletion and maintanance of Jupyter Notebook instances.
 * It includes utilities to:
 * - Install Jupyter Notebook on the current machine.
 * - Identify the existing Jupyter Notebook sessions on the current machine.
 */
export class JupyterManager {

    /**
     * The process spawned from the creation of a Jupyter Notebook instance
     * during the creation of a JupyterManager object.
     */
    private static process: ChildProcess;
    /**
     * The url set to the location of the Jupyter Notebook created in the constructor.
     */
    private static url: URL;
    /**
     * Pattern which matches Jupyter Notebook urls.
     */
    private static urlPattern = /http:\/\/localhost:[0-9]+\/\?token=[a-z0-9]+/g;
    /**
     * The timeout set during the initialisation of a Jupyter Notebook instance.
     */
    private static timeout = 10; // 10 seconds
    /**
     * Boolean which indicates whether the Jupyter Notebook is initialised in the current workspace.s
     */
    public workspaceSet = false;

    /**
     * Initialise a Jupyter Notebook process.
     */
    constructor() {

        if (vscode.workspace.workspaceFolders) {
            // Initialise a Jupyter Notebook in the current workspace if a workspace is set.
            JupyterManager.process = spawn(`jupyter`, ['notebook', '--no-browser', '--notebook-dir=' + vscode.workspace.workspaceFolders[0].uri.fsPath], { detached: false, cwd: JupyterManager.getScriptsLocationIfSpecified() });
            this.workspaceSet = true;
        }
        else {
            // Initialise a Jupyter Notebook automatically.
            JupyterManager.process = spawn(`jupyter`, ['notebook', '--no-browser'], { detached: false,  cwd: JupyterManager.getScriptsLocationIfSpecified() });
        }
        // The stderr is process by the extractJupyterInfos function.
        JupyterManager.process.stderr.on('data',
            (data: string) =>
                this.extractJupyterInfos(data)
        );
        JupyterManager.process.stdout.on('data',
            (data: string) =>
                this.extractJupyterInfos(data)
        );
        JupyterManager.process.on('close', (code) => {
            console.log(`child process exited with code ${code}`);
        });
    }

    /**
     * Dispose the current Jupyter Notebook process.
     * This function is called whenever the extension is closed.
     */
    public static disposeNotebook() {
        if (JupyterManager.process) {
            for (let i = 0; i <= 10 && !JupyterManager.process.killed; i++) {
                JupyterManager.process.kill('SIGINT')
            }
        }
    }

    /**
     * Extract the address of the Jupyter Notebook instance created from
     * the stderr of the spawned process.
     * @param data  The string produced by stderr.
     */
    private extractJupyterInfos(data: string) {
        // Look for a Jupyter Notebook url in the string received.
        let urlMatch = JupyterManager.urlPattern.exec(data);

        if (urlMatch) {
            JupyterManager.url = new URL(urlMatch[0]);
        }
    }

    /**
     * Check if a Jupyter Notebook instance was created within the defined timeout.
     * Every second the url variable is checked for definition.
     * If defined the Jupyter Notebook has been initialised correctly.
     * @param numTries  Timeout in seconds.
     * @param resolve   Promise resolve callback.
     * @param reject    Promise reject callback.
     */
    private defineTimeout(numTries: number, resolve, reject) {
        setTimeout(() => {
            if (!JupyterManager.url) {
                if (numTries == 0) {
                    JupyterManager.process.stderr.removeAllListeners();
                    reject('Jupyter could not be executed automatically');
                }
                else {
                    this.defineTimeout(numTries - 1, resolve, reject);
                }
            }
            else {
                JupyterManager.process.stderr.removeAllListeners();
                resolve(
                    {
                        baseUrl: JupyterManager.url.protocol + '//' + JupyterManager.url.host + '/',
                        token: JupyterManager.url.searchParams.get('token')
                    });
            }
        }, 1000);
    }

    /**
     * Get infos of the jupyter notebook created.
     * @returns A promised which is either resolved or rejected within the timeout.
     */
    public getJupyterAddressAndToken() {
        return new Promise<{ baseUrl: string, token: string }>((resolve, reject) => {
            this.defineTimeout(JupyterManager.timeout, resolve, reject);
        });
    }

    /**
     * Find the Jupyter Notebooks running on the current machine.
     * @returns An array containing the infos of the Jupyter Notebooks running on the current machine.
     */
    public static getRunningNotebooks() {
        try {
            let runningUrls =
                execSync(
                    'jupyter notebook list',
                    { stdio: 'pipe', encoding: 'utf8' }
                );

            let matches = runningUrls.match(JupyterManager.urlPattern);

            if (!matches) {
                return [];
            }
            else {
                return matches.map(input => {
                    let url = new URL(input);
                    return {
                        url: input,
                        info:
                        {
                            baseUrl: url.protocol + '//' + url.host + '/',
                            token: url.searchParams.get('token')
                        }
                    };
                });
            }
        }
        catch{
            return [];
        }
    }

    /**
     * Check if Jupyter Notebook is available on the current machine.
     * @returns A boolean, true if Jupyter Notebook is present, false if it is not.
     */
    public static isJupyterInPath(path?: string) {
        try {
            // Execute jupyter -h and check if Jupyter is present in default path the output returned.
            let jupyterHelpOutput =
                execSync(
                    'jupyter -h',
                    { stdio: 'pipe', encoding: 'utf8', cwd: path }
                );

            return !!jupyterHelpOutput.match(/Jupyter/g);
        }
        catch{
            try {
                let jupyterHelpOutput =
                    execSync(
                        `cd ${vscode.workspace.getConfiguration().get('python.pythonPath')} && jupyter -h;`,
                        { stdio: 'pipe', encoding: 'utf8' }
                    );
                return !!jupyterHelpOutput.match(/Jupyter/g);
            }
            catch {
                return false;
            }
        }
    }
    /**
     * Check if env is set, and return env/Scripts or null. =

     * @returns string  Path of Script for the Python environment, if not available, null.
     */
    public static getScriptsLocationIfSpecified(): string {
        if (vscode.workspace.getConfiguration().get('python.pythonPath')) {
            let path: string = vscode.workspace.getConfiguration().get('python.pythonPath');
            let delim: string;
            //set delimineter to whatever the path uses.
            // need to only remove last part of path because it includes python. 
            if (path.indexOf("/") == -1) delim = "\\"; else delim = "/";
            //take the path split it, take all but last, then join it again using delim.
            return path.split(delim).slice(0, -1).join(delim);
        }
        else {
            return undefined;
        }
    }
    /**
     * Create a terminal instance on the current machine and install
     * Jupyter Notebook through pip.
     * @param data  User response to the vscode prompt, install Jupyter Notebook if data is defined.
     */
    public static installJupyter(data) {
        if (data !== undefined) {
            let terminal = vscode.window.createTerminal('pip');
            terminal.show();
            terminal.sendText('pip install jupyter', true);
        }
    }
}
