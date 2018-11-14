import * as vscode from 'vscode';
export interface Cell {
    range: vscode.Range;
    title: string;
}