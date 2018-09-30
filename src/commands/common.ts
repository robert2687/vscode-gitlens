'use strict';
import * as path from 'path';
import {
    commands,
    Disposable,
    SourceControlResourceGroup,
    SourceControlResourceState,
    TextDocumentShowOptions,
    TextEditor,
    TextEditorEdit,
    Uri,
    ViewColumn,
    window,
    workspace
} from 'vscode';
import { BuiltInCommands, DocumentSchemes, ImageMimetypes } from '../constants';
import { Container } from '../container';
import { GitBranch, GitCommit, GitFile, GitRemote, GitUri, Repository } from '../git/gitService';
import { Logger } from '../logger';
import { CommandQuickPickItem, RepositoriesQuickPick } from '../quickpicks';
// import { Telemetry } from '../telemetry';
import { ExplorerNode, ExplorerRefNode } from '../views/nodes';

export enum Commands {
    ClearFileAnnotations = 'gitlens.clearFileAnnotations',
    CloseUnchangedFiles = 'gitlens.closeUnchangedFiles',
    ComputingFileAnnotations = 'gitlens.computingFileAnnotations',
    CopyMessageToClipboard = 'gitlens.copyMessageToClipboard',
    CopyRemoteFileUrlToClipboard = 'gitlens.copyRemoteFileUrlToClipboard',
    CopyShaToClipboard = 'gitlens.copyShaToClipboard',
    DiffDirectory = 'gitlens.diffDirectory',
    DiffHeadWithBranch = 'gitlens.diffHeadWithBranch',
    DiffWorkingWithBranch = 'gitlens.diffWorkingWithBranch',
    ExternalDiffAll = 'gitlens.externalDiffAll',
    DiffWith = 'gitlens.diffWith',
    DiffWithBranch = 'gitlens.diffWithBranch',
    DiffWithNext = 'gitlens.diffWithNext',
    DiffWithPrevious = 'gitlens.diffWithPrevious',
    DiffWithPreviousInDiff = 'gitlens.diffWithPreviousInDiff',
    DiffLineWithPrevious = 'gitlens.diffLineWithPrevious',
    DiffWithRevision = 'gitlens.diffWithRevision',
    DiffWithWorking = 'gitlens.diffWithWorking',
    DiffLineWithWorking = 'gitlens.diffLineWithWorking',
    ExternalDiff = 'gitlens.externalDiff',
    ExplorersOpenDirectoryDiff = 'gitlens.explorers.openDirectoryDiff',
    ExplorersOpenDirectoryDiffWithWorking = 'gitlens.explorers.openDirectoryDiffWithWorking',
    OpenChangedFiles = 'gitlens.openChangedFiles',
    OpenBranchesInRemote = 'gitlens.openBranchesInRemote',
    OpenBranchInRemote = 'gitlens.openBranchInRemote',
    OpenCommitInRemote = 'gitlens.openCommitInRemote',
    OpenFileInRemote = 'gitlens.openFileInRemote',
    OpenFileRevision = 'gitlens.openFileRevision',
    OpenInRemote = 'gitlens.openInRemote',
    OpenRepoInRemote = 'gitlens.openRepoInRemote',
    OpenWorkingFile = 'gitlens.openWorkingFile',
    ResetSuppressedWarnings = 'gitlens.resetSuppressedWarnings',
    ShowCommitSearch = 'gitlens.showCommitSearch',
    ShowFileHistoryExplorer = 'gitlens.showFileHistoryExplorer',
    ShowLineHistoryExplorer = 'gitlens.showLineHistoryExplorer',
    ShowLastQuickPick = 'gitlens.showLastQuickPick',
    ShowQuickBranchHistory = 'gitlens.showQuickBranchHistory',
    ShowQuickCommitDetails = 'gitlens.showQuickCommitDetails',
    ShowQuickCommitFileDetails = 'gitlens.showQuickCommitFileDetails',
    ShowQuickCurrentBranchHistory = 'gitlens.showQuickRepoHistory',
    ShowQuickFileHistory = 'gitlens.showQuickFileHistory',
    ShowQuickRepoStatus = 'gitlens.showQuickRepoStatus',
    ShowQuickRevisionDetails = 'gitlens.showQuickRevisionDetails',
    ShowQuickStashList = 'gitlens.showQuickStashList',
    ShowRepositoriesExplorer = 'gitlens.showRepositoriesExplorer',
    ShowResultsExplorer = 'gitlens.showResultsExplorer',
    ShowSettingsPage = 'gitlens.showSettingsPage',
    ShowWelcomePage = 'gitlens.showWelcomePage',
    StashApply = 'gitlens.stashApply',
    StashDelete = 'gitlens.stashDelete',
    StashSave = 'gitlens.stashSave',
    SwitchMode = 'gitlens.switchMode',
    ToggleCodeLens = 'gitlens.toggleCodeLens',
    ToggleFileBlame = 'gitlens.toggleFileBlame',
    ToggleFileHeatmap = 'gitlens.toggleFileHeatmap',
    ToggleFileRecentChanges = 'gitlens.toggleFileRecentChanges',
    ToggleLineBlame = 'gitlens.toggleLineBlame',
    ToggleReviewMode = 'gitlens.toggleReviewMode',
    ToggleZenMode = 'gitlens.toggleZenMode'
}

export function getCommandUri(uri?: Uri, editor?: TextEditor): Uri | undefined {
    if (uri instanceof Uri) return uri;
    if (editor == null) return undefined;

    const document = editor.document;
    if (document == null) return undefined;

    return document.uri;
}

export async function getRepoPathOrActiveOrPrompt(
    uri: Uri | undefined,
    editor: TextEditor | undefined,
    placeholder: string,
    goBackCommand?: CommandQuickPickItem
) {
    let repoPath = await Container.git.getRepoPathOrActive(uri, editor);
    if (!repoPath) {
        const pick = await RepositoriesQuickPick.show(placeholder, goBackCommand);
        if (pick instanceof CommandQuickPickItem) {
            await pick.execute();
            return undefined;
        }

        if (pick === undefined) {
            if (goBackCommand !== undefined) {
                await goBackCommand.execute();
            }
            return undefined;
        }

        repoPath = pick.repoPath;
    }
    return repoPath;
}

export async function getRepoPathOrPrompt(
    uri: Uri | undefined,
    placeholder: string,
    goBackCommand?: CommandQuickPickItem
) {
    let repoPath = await Container.git.getRepoPath(uri);
    if (!repoPath) {
        const pick = await RepositoriesQuickPick.show(placeholder, goBackCommand);
        if (pick instanceof CommandQuickPickItem) {
            await pick.execute();
            return undefined;
        }

        if (pick === undefined) {
            if (goBackCommand !== undefined) {
                await goBackCommand.execute();
            }
            return undefined;
        }

        repoPath = pick.repoPath;
    }
    return repoPath;
}

export interface CommandContextParsingOptions {
    editor: boolean;
    uri: boolean;
}

export interface CommandBaseContext {
    command: string;
    editor?: TextEditor;
    uri?: Uri;
}

export interface CommandScmGroupsContext extends CommandBaseContext {
    type: 'scm-groups';
    scmResourceGroups: SourceControlResourceGroup[];
}

export interface CommandScmStatesContext extends CommandBaseContext {
    type: 'scm-states';
    scmResourceStates: SourceControlResourceState[];
}

export interface CommandUnknownContext extends CommandBaseContext {
    type: 'unknown';
}

export interface CommandUriContext extends CommandBaseContext {
    type: 'uri';
}

export interface CommandViewContext extends CommandBaseContext {
    type: 'view';
}

export interface CommandViewItemContext extends CommandBaseContext {
    type: 'viewItem';
    node: ExplorerNode;
}

export function isCommandViewContextWithBranch(
    context: CommandContext
): context is CommandViewItemContext & { node: ExplorerNode & { branch: GitBranch } } {
    if (context.type !== 'viewItem') return false;

    return (context.node as ExplorerNode & { branch: GitBranch }).branch instanceof GitBranch;
}

export function isCommandViewContextWithCommit<T extends GitCommit>(
    context: CommandContext
): context is CommandViewItemContext & { node: ExplorerNode & { commit: T } } {
    if (context.type !== 'viewItem') return false;

    return (context.node as ExplorerNode & { commit: GitCommit }).commit instanceof GitCommit;
}

export function isCommandViewContextWithFile(
    context: CommandContext
): context is CommandViewItemContext & { node: ExplorerNode & { file: GitFile; repoPath: string } } {
    if (context.type !== 'viewItem') return false;

    const node = context.node as ExplorerNode & { file: GitFile; repoPath: string };
    return node.file !== undefined && (node.file.repoPath !== undefined || node.repoPath !== undefined);
}

export function isCommandViewContextWithFileCommit(
    context: CommandContext
): context is CommandViewItemContext & { node: ExplorerNode & { commit: GitCommit; file: GitFile; repoPath: string } } {
    if (context.type !== 'viewItem') return false;

    const node = context.node as ExplorerNode & { commit: GitCommit; file: GitFile; repoPath: string };
    return (
        node.file !== undefined &&
        node.commit instanceof GitCommit &&
        (node.file.repoPath !== undefined || node.repoPath !== undefined)
    );
}

export function isCommandViewContextWithFileRefs(
    context: CommandContext
): context is CommandViewItemContext & {
    node: ExplorerNode & { file: GitFile; ref1: string; ref2: string; repoPath: string };
} {
    if (context.type !== 'viewItem') return false;

    const node = context.node as ExplorerNode & { file: GitFile; ref1: string; ref2: string; repoPath: string };
    return (
        node.file !== undefined &&
        node.ref1 !== undefined &&
        node.ref2 !== undefined &&
        (node.file.repoPath !== undefined || node.repoPath !== undefined)
    );
}

export function isCommandViewContextWithRef(
    context: CommandContext
): context is CommandViewItemContext & { node: ExplorerNode & { ref: string } } {
    return context.type === 'viewItem' && context.node instanceof ExplorerRefNode;
}

export function isCommandViewContextWithRemote(
    context: CommandContext
): context is CommandViewItemContext & { node: ExplorerNode & { remote: GitRemote } } {
    if (context.type !== 'viewItem') return false;

    return (context.node as ExplorerNode & { remote: GitRemote }).remote instanceof GitRemote;
}

export function isCommandViewContextWithRepo(
    context: CommandContext
): context is CommandViewItemContext & { node: ExplorerNode & { repo: Repository } } {
    if (context.type !== 'viewItem') return false;

    return (context.node as ExplorerNode & { repo?: Repository }).repo instanceof Repository;
}

export type CommandContext =
    | CommandScmGroupsContext
    | CommandScmStatesContext
    | CommandUnknownContext
    | CommandUriContext
    | CommandViewContext
    | CommandViewItemContext;

function isScmResourceGroup(group: any): group is SourceControlResourceGroup {
    if (group == null) return false;

    return (
        (group as SourceControlResourceGroup).id !== undefined &&
        (group.handle !== undefined ||
            (group as SourceControlResourceGroup).label !== undefined ||
            (group as SourceControlResourceGroup).resourceStates !== undefined)
    );
}

function isScmResourceState(state: any): state is SourceControlResourceState {
    if (state == null) return false;

    return (state as SourceControlResourceState).resourceUri != null;
}

function isTextEditor(editor: any): editor is TextEditor {
    if (editor == null) return false;

    return (
        editor.id !== undefined &&
        ((editor as TextEditor).edit !== undefined || (editor as TextEditor).document !== undefined)
    );
}

export abstract class Command implements Disposable {
    static getMarkdownCommandArgsCore<T>(command: Commands, args: T): string {
        return `command:${command}?${encodeURIComponent(JSON.stringify(args))}`;
    }

    protected readonly contextParsingOptions: CommandContextParsingOptions = { editor: false, uri: false };

    private _disposable: Disposable;

    constructor(command: Commands | Commands[]) {
        if (typeof command === 'string') {
            this._disposable = commands.registerCommand(
                command,
                (...args: any[]) => this._execute(command, ...args),
                this
            );

            return;
        }

        const subscriptions = command.map(cmd =>
            commands.registerCommand(cmd, (...args: any[]) => this._execute(cmd, ...args), this)
        );
        this._disposable = Disposable.from(...subscriptions);
    }

    dispose() {
        this._disposable && this._disposable.dispose();
    }

    protected async preExecute(context: CommandContext, ...args: any[]): Promise<any> {
        return this.execute(...args);
    }

    abstract execute(...args: any[]): any;

    protected _execute(command: string, ...args: any[]): any {
        // Telemetry.trackEvent(command);

        const [context, rest] = Command.parseContext(command, { ...this.contextParsingOptions }, ...args);
        return this.preExecute(context, ...rest);
    }

    private static parseContext(
        command: string,
        options: CommandContextParsingOptions,
        ...args: any[]
    ): [CommandContext, any[]] {
        let editor: TextEditor | undefined = undefined;

        let firstArg = args[0];
        if (options.editor && (firstArg == null || isTextEditor(firstArg))) {
            editor = firstArg;
            args = args.slice(1);
            firstArg = args[0];
        }

        let maybeView = false;
        if (options.uri && (firstArg == null || firstArg instanceof Uri)) {
            const [uri, ...rest] = args as [Uri, any];
            if (uri !== undefined) {
                return [{ command: command, type: 'uri', editor: editor, uri: uri }, rest];
            }
            else {
                maybeView = args.length === 0;
            }
        }

        if (firstArg instanceof ExplorerNode) {
            const [node, ...rest] = args as [ExplorerNode, any];
            return [{ command: command, type: 'viewItem', node: node, uri: node.uri }, rest];
        }

        if (isScmResourceState(firstArg)) {
            const states = [];
            let count = 0;
            for (const arg of args) {
                if (!isScmResourceState(arg)) break;

                count++;
                states.push(arg);
            }

            return [
                { command: command, type: 'scm-states', scmResourceStates: states, uri: states[0].resourceUri },
                args.slice(count)
            ];
        }

        if (isScmResourceGroup(firstArg)) {
            const groups = [];
            let count = 0;
            for (const arg of args) {
                if (!isScmResourceGroup(arg)) break;

                count++;
                groups.push(arg);
            }

            return [{ command: command, type: 'scm-groups', scmResourceGroups: groups }, args.slice(count)];
        }

        if (maybeView) {
            return [{ command: command, type: 'view', editor: editor }, args];
        }

        return [{ command: command, type: 'unknown', editor: editor }, args];
    }
}

export abstract class ActiveEditorCommand extends Command {
    protected readonly contextParsingOptions: CommandContextParsingOptions = { editor: true, uri: true };

    constructor(command: Commands | Commands[]) {
        super(command);
    }

    protected async preExecute(context: CommandContext, ...args: any[]): Promise<any> {
        return this.execute(context.editor, context.uri, ...args);
    }

    protected _execute(command: string, ...args: any[]): any {
        return super._execute(command, window.activeTextEditor, ...args);
    }

    abstract execute(editor?: TextEditor, ...args: any[]): any;
}

let lastCommand: { command: string; args: any[] } | undefined = undefined;
export function getLastCommand() {
    return lastCommand;
}

export abstract class ActiveEditorCachedCommand extends ActiveEditorCommand {
    constructor(command: Commands | Commands[]) {
        super(command);
    }

    protected _execute(command: string, ...args: any[]): any {
        lastCommand = {
            command: command,
            args: args
        };
        return super._execute(command, ...args);
    }

    abstract execute(editor: TextEditor, ...args: any[]): any;
}

export abstract class EditorCommand implements Disposable {
    private _disposable: Disposable;

    constructor(command: Commands | Commands[]) {
        if (!Array.isArray(command)) {
            command = [command];
        }

        const subscriptions = [];
        for (const cmd of command) {
            subscriptions.push(
                commands.registerTextEditorCommand(
                    cmd,
                    (editor: TextEditor, edit: TextEditorEdit, ...args: any[]) =>
                        this.executeCore(cmd, editor, edit, ...args),
                    this
                )
            );
        }
        this._disposable = Disposable.from(...subscriptions);
    }

    dispose() {
        this._disposable && this._disposable.dispose();
    }

    private executeCore(command: string, editor: TextEditor, edit: TextEditorEdit, ...args: any[]): any {
        // Telemetry.trackEvent(command);
        return this.execute(editor, edit, ...args);
    }

    abstract execute(editor: TextEditor, edit: TextEditorEdit, ...args: any[]): any;
}

export async function openEditor(
    uri: Uri,
    options: TextDocumentShowOptions & { rethrow?: boolean } = {}
): Promise<TextEditor | undefined> {
    const { rethrow, ...opts } = options;
    try {
        if (uri instanceof GitUri) {
            uri = uri.documentUri({ noSha: true });
        }

        if (uri.scheme === DocumentSchemes.GitLens && ImageMimetypes[path.extname(uri.fsPath)]) {
            await commands.executeCommand(BuiltInCommands.Open, uri);

            return undefined;
        }

        const document = await workspace.openTextDocument(uri);
        return window.showTextDocument(document, {
            preserveFocus: false,
            preview: true,
            viewColumn: ViewColumn.Active,
            ...opts
        });
    }
    catch (ex) {
        const msg = ex.toString();
        if (msg.includes('File seems to be binary and cannot be opened as text')) {
            await commands.executeCommand(BuiltInCommands.Open, uri);

            return undefined;
        }

        if (rethrow) throw ex;

        Logger.error(ex, 'openEditor');
        return undefined;
    }
}

export function openWorkspace(uri: Uri, name: string, options: { openInNewWindow?: boolean } = {}) {
    if (options.openInNewWindow) {
        commands.executeCommand(BuiltInCommands.OpenFolder, uri, true);

        return true;
    }

    return workspace.updateWorkspaceFolders(
        workspace.workspaceFolders !== undefined ? workspace.workspaceFolders.length : 0,
        null,
        { uri, name }
    );
}
