import { Injectable, Inject, forwardRef } from '@angular/core';
import { AppService, BaseTabComponent, ConfigService, SplitTabComponent as SplitTabComponentClass, ProfilesService, QuickConnectProfileProvider } from 'tabby-core';
import { BaseTerminalTabComponent } from 'tabby-terminal';
import { z } from 'zod';
import { BaseToolCategory } from './base-tool-category';
import { McpLoggerService } from '../services/mcpLogger.service';
import { McpTool } from '../types/types';
import { TerminalToolCategory } from './terminal';

// Newer Tabby forks export SplitTabComponent as a value alias of the
// workspace component rather than a class. Keep both a runtime value (for
// `instanceof`) and a usable instance type (for casts/annotations).
const SplitTabComponent = SplitTabComponentClass;
type SplitTabComponent = InstanceType<typeof SplitTabComponentClass>;

/**
 * Tab Management Tools Category - Comprehensive tab and profile management
 */
@Injectable({ providedIn: 'root' })
export class TabManagementToolCategory extends BaseToolCategory {
    name = 'tab_management';

    constructor(
        private app: AppService,
        logger: McpLoggerService,
        private config: ConfigService,
        private profilesService: ProfilesService,
        @Inject(forwardRef(() => TerminalToolCategory)) private terminalTools: TerminalToolCategory
    ) {
        super(logger);
        this.initializeTools();
    }

    private initializeTools(): void {
        // Tab operations
        this.registerTool(this.createListTabsTool());
        this.registerTool(this.createSelectTabTool());
        this.registerTool(this.createCloseTabTool());
        this.registerTool(this.createCloseAllTabsTool());
        this.registerTool(this.createDuplicateTabTool());
        this.registerTool(this.createNextTabTool());
        this.registerTool(this.createPreviousTabTool());
        this.registerTool(this.createMoveTabLeftTool());
        this.registerTool(this.createMoveTabRightTool());
        this.registerTool(this.createReopenLastTabTool());

        // Profile/Session operations
        this.registerTool(this.createListProfilesTool());
        this.registerTool(this.createOpenProfileTool());
        this.registerTool(this.createShowProfileSelectorTool());
        this.registerTool(this.createQuickConnectTool());

        // Split pane operations
        this.registerTool(this.createSplitTabTool());

        // Cross-workspace pane move
        this.registerTool(this.createMovePaneToWorkspaceTool());

        // Extended tab / workspace management
        this.registerTool(this.createRenameWorkspaceTool());
        this.registerTool(this.createRenameSessionTool());
        this.registerTool(this.createMoveTabToIndexTool());
        this.registerTool(this.createMoveSessionToIndexTool());
        this.registerTool(this.createDuplicateWorkspaceTool());
        this.registerTool(this.createDuplicateSessionTool());
        this.registerTool(this.createCreateWorkspaceTool());
        this.registerTool(this.createCloseSessionTool());
        this.registerTool(this.createTogglePinTool());
        this.registerTool(this.createSetWorkspaceColorTool());
        this.registerTool(this.createToggleFocusAllTool());

        this.logger.info('Tab management tools initialized');
    }

    // Tab ID registry for stable IDs
    // Use both WeakMap (for tab -> id) and Map (for id -> tab) to support bidirectional lookup
    private tabToId = new WeakMap<BaseTabComponent, string>();
    private idToTab = new Map<string, BaseTabComponent>();

    // ============= Tab Operations =============

    /**
     * Get or create stable tab ID
     * Uses bidirectional mapping for reliable lookup
     */
    private getOrCreateTabId(tab: BaseTabComponent): string {
        let tabId = this.tabToId.get(tab);
        if (!tabId) {
            tabId = 'tab-' + 'xxxxxxxx'.replace(/[x]/g, () => {
                return (Math.random() * 16 | 0).toString(16);
            });
            this.tabToId.set(tab, tabId);
            this.idToTab.set(tabId, tab);
        }
        return tabId;
    }

    /**
     * Find tab by its stable ID
     * Uses reverse lookup map for efficiency
     */
    private findTabById(tabId: string): BaseTabComponent | null {
        // First try the reverse lookup map
        const tab = this.idToTab.get(tabId);
        if (tab) {
            // Verify the tab is still valid (exists in app.tabs)
            if (this.app.tabs.includes(tab)) {
                return tab;
            }
            // Clean up stale reference
            this.idToTab.delete(tabId);
        }
        // Fallback: scan all tabs (in case the map is out of sync)
        for (const t of this.app.tabs) {
            if (this.tabToId.get(t) === tabId) {
                // Re-register in reverse map
                this.idToTab.set(tabId, t);
                return t;
            }
        }
        return null;
    }

    /**
     * Find tab by flexible locator
     * Priority: tabId (stable) > tabIndex (legacy) > title (partial match)
     * If no locator is provided, returns the currently active/focused tab
     */
    private findTabByLocator(locator: { tabId?: string; tabIndex?: number; title?: string }): BaseTabComponent | null {
        this.logger.debug(`findTabByLocator called with: ${JSON.stringify(locator)}`);

        // If no locator parameters provided, return the currently active tab
        if (!locator.tabId && locator.tabIndex === undefined && !locator.title) {
            const activeTab = this.app.tabs.find(tab => tab.hasFocus);
            if (activeTab) {
                this.logger.debug('No locator provided, returning active/focused tab');
                return activeTab;
            }
            // If no focused tab, return the first tab
            if (this.app.tabs.length > 0) {
                this.logger.debug('No focused tab, returning first tab');
                return this.app.tabs[0];
            }
            return null;
        }

        // Priority 1: tabId (stable) - use optimized reverse lookup
        if (locator.tabId) {
            const found = this.findTabById(locator.tabId);
            if (found) {
                this.logger.debug(`Found tab by tabId: ${locator.tabId}`);
                return found;
            }
            this.logger.debug(`Tab not found by tabId: ${locator.tabId}`);
        }
        // Priority 2: tabIndex
        if (locator.tabIndex !== undefined && locator.tabIndex >= 0 && locator.tabIndex < this.app.tabs.length) {
            const found = this.app.tabs[locator.tabIndex];
            this.logger.debug(`Found tab by tabIndex: ${locator.tabIndex}`);
            return found;
        }
        // Priority 3: title (partial match, case-insensitive)
        if (locator.title) {
            const titleLower = locator.title.toLowerCase();
            const found = this.app.tabs.find(tab => tab.title?.toLowerCase().includes(titleLower));
            if (found) {
                this.logger.debug(`Found tab by title: ${locator.title}`);
                return found;
            }
            this.logger.debug(`Tab not found by title: ${locator.title}`);
        }
        this.logger.debug(`No tab found for locator: ${JSON.stringify(locator)}`);
        return null;
    }

    private getQuickConnectProviders(): any[] {
        // Stock Tabby marked some providers with `supportsQuickConnect`;
        // forks expose the base class instead. `instanceof` covers both.
        return this.profilesService.getProviders().filter(provider => provider instanceof QuickConnectProfileProvider);
    }

    private getQuickConnectProvider(providerId: string): any | null {
        return this.getQuickConnectProviders().find(provider => provider.id === providerId) ?? null;
    }

    private buildSshQuickConnectProfile(query: string): any | null {
        let user: string | undefined = undefined;
        let host = query;
        let port = 22;

        if (!host.trim()) {
            return null;
        }

        if (host.includes('@')) {
            const parts = host.split(/@/g);
            host = parts[parts.length - 1];
            user = parts.slice(0, parts.length - 1).join('@') || undefined;
        }

        if (host.includes('[')) {
            const closeBracketIndex = host.indexOf(']');
            if (closeBracketIndex === -1) {
                return null;
            }
            const portPart = host.slice(closeBracketIndex + 1);
            if (portPart.startsWith(':') && portPart.length > 1) {
                const parsedPort = Number(portPart.slice(1));
                if (!Number.isFinite(parsedPort) || parsedPort <= 0) {
                    return null;
                }
                port = parsedPort;
            }
            host = host.slice(1, closeBracketIndex);
        } else if (host.includes(':')) {
            const parts = host.split(/:/g);
            if (parts.length !== 2 || !parts[0]) {
                return null;
            }
            const parsedPort = Number(parts[1]);
            if (!Number.isFinite(parsedPort) || parsedPort <= 0) {
                return null;
            }
            host = parts[0];
            port = parsedPort;
        }

        if (!host.trim()) {
            return null;
        }

        return {
            name: query,
            type: 'ssh',
            options: {
                host,
                user,
                port,
            },
        };
    }

    private resolveQuickConnectTarget(
        query: string,
        protocol: 'auto' | 'ssh' | 'telnet' | 'socket' | 'serial' = 'auto'
    ): { provider: any | null; normalizedQuery: string; resolvedProtocol: string; error?: string; hint?: string } {
        const providers = this.getQuickConnectProviders();
        const providerIds = providers.map(provider => provider.id).sort();

        const explicitProtocolMatch = query.match(/^([a-z][a-z0-9+.-]*):\/\/(.+)$/i);
        let normalizedQuery = query.trim();
        let requestedProtocol = protocol;

        if (explicitProtocolMatch) {
            const scheme = explicitProtocolMatch[1].toLowerCase();
            const body = explicitProtocolMatch[2];
            if (scheme === 'ssh' || scheme === 'telnet' || scheme === 'socket' || scheme === 'serial') {
                requestedProtocol = scheme as 'ssh' | 'telnet' | 'socket' | 'serial';
                normalizedQuery = body;
            }
        }

        if (requestedProtocol !== 'auto') {
            if (requestedProtocol === 'ssh') {
                return { provider: this.getQuickConnectProvider('ssh'), normalizedQuery, resolvedProtocol: 'ssh' };
            }

            const provider = this.getQuickConnectProvider(requestedProtocol);
            return provider
                ? { provider, normalizedQuery, resolvedProtocol: requestedProtocol }
                : {
                    provider: null,
                    normalizedQuery,
                    resolvedProtocol: requestedProtocol,
                    error: `Quick connect protocol \"${requestedProtocol}\" is unavailable`,
                    hint: providerIds.length
                        ? `Available quick-connect providers: ${providerIds.join(', ')}`
                        : 'No quick-connect providers are currently available.'
                };
        }

        const sshProvider = this.getQuickConnectProvider('ssh');
        const telnetProvider = this.getQuickConnectProvider('telnet');
        const socketProvider = this.getQuickConnectProvider('socket');
        const serialProvider = this.getQuickConnectProvider('serial');

        const looksLikeSerial = /^(COM\d+|\/dev\/(tty|cu)\S+)$/i.test(normalizedQuery);
        if (looksLikeSerial && serialProvider) {
            return { provider: serialProvider, normalizedQuery, resolvedProtocol: 'serial' };
        }

        const looksLikeSsh = normalizedQuery.includes('@');
        if (looksLikeSsh) {
            return { provider: sshProvider, normalizedQuery, resolvedProtocol: 'ssh' };
        }

        const ipv6WithPort = normalizedQuery.match(/^\[.+\]:(\d+)$/);
        const hostWithPort = normalizedQuery.match(/^[^:@]+:(\d+)$/);
        const portMatch = ipv6WithPort ?? hostWithPort;
        if (portMatch) {
            const port = Number(portMatch[1]);
            if (port === 22) {
                return { provider: sshProvider, normalizedQuery, resolvedProtocol: 'ssh' };
            }
            if (port === 23 && telnetProvider) {
                return { provider: telnetProvider, normalizedQuery, resolvedProtocol: 'telnet' };
            }
            if (socketProvider) {
                return { provider: socketProvider, normalizedQuery, resolvedProtocol: 'socket' };
            }
            if (telnetProvider) {
                return { provider: telnetProvider, normalizedQuery, resolvedProtocol: 'telnet' };
            }
            if (sshProvider) {
                return { provider: sshProvider, normalizedQuery, resolvedProtocol: 'ssh' };
            }
        }

        if (providers.length === 1) {
            return { provider: providers[0], normalizedQuery, resolvedProtocol: providers[0].id };
        }

        if (sshProvider) {
            return { provider: sshProvider, normalizedQuery, resolvedProtocol: 'ssh' };
        }

        return {
            provider: null,
            normalizedQuery,
            resolvedProtocol: 'auto',
            error: 'Ambiguous quick connect target',
            hint: providerIds.length
                ? `Specify protocol explicitly (ssh://, telnet://, socket://, serial://) or use protocol=. Available providers: ${providerIds.join(', ')}`
                : 'No quick-connect providers are currently available.'
        };
    }

    private async openProfileTabAndBuildResponse(
        profile: any,
        params: { waitForReady?: boolean; timeout?: number },
        sourceLabel: 'open_profile' | 'quick_connect'
    ): Promise<any> {
        const timeout = params?.timeout ?? 30000;

        this.logger.info(`[${sourceLabel}] Opening profile: ${profile.name} (type: ${profile.type})`);
        const tab = await this.profilesService.openNewTabForProfile(profile);

        if (!tab) {
            this.logger.error(`[${sourceLabel}] Failed to open profile: ${profile.name}`);
            return {
                content: [{ type: 'text', text: JSON.stringify({ success: false, error: 'Failed to open profile' }) }]
            };
        }

        const topLevelTab = this.app.getParentTab(tab) ?? tab;
        const tabId = this.getOrCreateTabId(topLevelTab);
        const tabIndex = this.app.tabs.indexOf(topLevelTab);
        const isSSH = profile.type === 'ssh' || profile.type?.includes('ssh');
        const waitForReady = params?.waitForReady ?? isSSH;

        let sessionId: string | undefined;
        if (tab instanceof BaseTerminalTabComponent) {
            sessionId = this.terminalTools.getOrCreateSessionId(tab);
            this.logger.debug(`[${sourceLabel}] SessionId assigned: ${sessionId}`);
        }

        if (!sessionId) {
            sessionId = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
                const r = Math.random() * 16 | 0;
                const v = c === 'x' ? r : (r & 0x3 | 0x8);
                return v.toString(16);
            });
            this.logger.warn(`[${sourceLabel}] Tab is not BaseTerminalTabComponent, generated fallback sessionId: ${sessionId}`);
        }

        if (waitForReady) {
            const timing = this.config.store.mcp?.timing || {};
            const sessionPollInterval = timing.sessionPollInterval ?? 200;
            const sessionStableChecks = timing.sessionStableChecks ?? 5;

            const startTime = Date.now();
            let tabReady = false;
            let sshConnected = false;
            let lastBufferLength = 0;
            let stableCount = 0;

            this.logger.debug(`[${sourceLabel}] Waiting for ready (isSSH=${isSSH}, timeout=${timeout}ms)`);

            while (Date.now() - startTime < timeout) {
                const tabAny = tab as any;
                const frontendReady = tabAny.frontend !== undefined;
                const sessionReady = tabAny.sessionReady === true;
                const sessionOpen = tabAny.session?.open === true;

                if (isSSH) {
                    const sshSession = tabAny.sshSession;
                    if (sshSession && sshSession.open === true) {
                        sshConnected = true;
                        tabReady = true;
                        this.logger.info(`[${sourceLabel}] SSH session connected: ${profile.name}`);
                        break;
                    }
                } else {
                    if (sessionOpen || (frontendReady && sessionReady)) {
                        tabReady = true;
                        break;
                    }
                }

                let bufferLength = 0;
                try {
                    const xterm = tabAny.frontend?.xterm;
                    if (xterm?.buffer?.active) {
                        bufferLength = xterm.buffer.active.length;
                    }
                } catch (e) {
                    // Ignore buffer access errors
                }

                if (!isSSH) {
                    if (bufferLength > 0 && bufferLength === lastBufferLength) {
                        stableCount++;
                        if (stableCount >= sessionStableChecks) {
                            tabReady = true;
                            break;
                        }
                    } else {
                        stableCount = 0;
                        lastBufferLength = bufferLength;
                    }
                } else if (bufferLength !== lastBufferLength) {
                    lastBufferLength = bufferLength;
                    this.logger.debug(`[${sourceLabel}] SSH buffer activity: ${bufferLength} chars`);
                }

                await new Promise(resolve => setTimeout(resolve, sessionPollInterval));
            }

            const elapsed = Date.now() - startTime;
            const ready = isSSH ? (tabReady && sshConnected) : tabReady;

            this.logger.info(`[${sourceLabel}] Profile opened: ${profile.name} (tabReady=${tabReady}, sshConnected=${sshConnected}, ready=${ready}, elapsed=${elapsed}ms)`);

            return {
                content: [{
                    type: 'text', text: JSON.stringify({
                        success: true,
                        sessionId,
                        tabId,
                        tabIndex,
                        tabTitle: tab.title,
                        profileName: profile.name,
                        profileType: profile.type,
                        tabReady,
                        sshConnected: isSSH ? sshConnected : undefined,
                        ready,
                        elapsed: `${elapsed}ms`,
                        message: ready
                            ? `Profile ready: ${profile.name}`
                            : tabReady && !sshConnected
                                ? `Tab opened but SSH not connected: ${profile.name}`
                                : `Profile opened but not fully ready: ${profile.name}`,
                        hint: ready
                            ? 'Use sessionId with exec_command, SFTP tools, etc.'
                            : 'Session may not be fully connected. Check sshConnected status.'
                    })
                }]
            };
        }

        this.logger.info(`[${sourceLabel}] Profile opened (no wait): ${profile.name}`);
        return {
            content: [{
                type: 'text', text: JSON.stringify({
                    success: true,
                    sessionId,
                    tabId,
                    tabIndex,
                    tabTitle: tab.title,
                    profileName: profile.name,
                    profileType: profile.type,
                    tabReady: undefined,
                    sshConnected: undefined,
                    ready: false,
                    message: `Opened profile: ${profile.name}`,
                    note: 'Profile opened without waiting. Use get_session_list to check status.',
                    hint: 'Use sessionId with exec_command, SFTP tools, etc.'
                })
            }]
        };
    }

    private createListTabsTool(): McpTool {
        return {
            name: 'list_tabs',
            description: `List all open tabs in Tabby with stable IDs and metadata.
Use tabId (stable) for reliable tab targeting; tabIndex may change if tabs are reordered.`,
            schema: z.object({}),
            handler: async () => {
                const tabs = this.app.tabs.map((tab, index) => {
                    const tabAny = tab as any;
                    const isTerminal = tab instanceof BaseTerminalTabComponent;
                    return {
                        tabId: this.getOrCreateTabId(tab),
                        tabIndex: index,
                        title: tab.title || `Tab ${index}`,
                        type: tab.constructor.name,
                        isActive: this.app.activeTab === tab,
                        hasFocus: tab.hasFocus,
                        color: tab.color,
                        isTerminal,
                        profile: tabAny.profile ? {
                            id: tabAny.profile.id,
                            name: tabAny.profile.name,
                            type: tabAny.profile.type
                        } : undefined
                    };
                });

                this.logger.info(`Listed ${tabs.length} tabs`);
                return {
                    content: [{ type: 'text', text: JSON.stringify({ success: true, tabs, count: tabs.length }, null, 2) }]
                };
            }
        };
    }

    private createSelectTabTool(): McpTool {
        return {
            name: 'select_tab',
            description: `Select/focus a specific tab.
Tab targeting: tabId (stable, recommended) > tabIndex (legacy) > title (partial match)`,
            schema: z.object({
                tabId: z.string().optional().describe('Stable tab ID (recommended, from list_tabs)'),
                tabIndex: z.number().optional().describe('Tab index (legacy, may change)'),
                title: z.string().optional().describe('Match by title (partial, case-insensitive)')
            }),
            handler: async (params: { tabId?: string; tabIndex?: number; title?: string }) => {
                const tab = this.findTabByLocator(params);

                if (!tab) {
                    return {
                        content: [{
                            type: 'text', text: JSON.stringify({
                                success: false,
                                error: 'No matching tab found',
                                hint: 'Use list_tabs to see available tabs with their tabIds'
                            })
                        }]
                    };
                }

                this.app.selectTab(tab);
                const tabId = this.getOrCreateTabId(tab);

                this.logger.info(`Selected tab: ${tab.title}`);
                return {
                    content: [{ type: 'text', text: JSON.stringify({ success: true, tabId, message: `Selected tab: ${tab.title}` }) }]
                };
            }
        };
    }

    private createCloseTabTool(): McpTool {
        return {
            name: 'close_tab',
            description: `Close a specific tab. If no locator provided, closes the active tab.
Tab targeting: tabId (stable, recommended) > tabIndex (legacy) > title (partial match)`,
            schema: z.object({
                tabId: z.string().optional().describe('Stable tab ID (recommended)'),
                tabIndex: z.number().optional().describe('Tab index (legacy)'),
                title: z.string().optional().describe('Match by title'),
                force: z.boolean().optional().describe('Force close without asking (default: false)')
            }),
            handler: async (params: { tabId?: string; tabIndex?: number; title?: string; force?: boolean }) => {
                const { tabId, tabIndex, title, force = false } = params;

                let tab: BaseTabComponent | null;
                // If any locator is provided, use findTabByLocator
                if (tabId || tabIndex !== undefined || title) {
                    tab = this.findTabByLocator({ tabId, tabIndex, title });
                } else {
                    // Default to active tab
                    tab = this.app.activeTab;
                }

                if (!tab) {
                    return {
                        content: [{ type: 'text', text: JSON.stringify({ success: false, error: 'No matching tab found' }) }]
                    };
                }

                const closedTitle = tab.title;
                const closedTabId = this.getOrCreateTabId(tab);
                await this.app.closeTab(tab, !force);

                this.logger.info(`Closed tab: ${closedTitle}`);
                return {
                    content: [{ type: 'text', text: JSON.stringify({ success: true, tabId: closedTabId, message: `Closed tab: ${closedTitle}` }) }]
                };
            }
        };
    }

    private createCloseAllTabsTool(): McpTool {
        return {
            name: 'close_all_tabs',
            description: 'Close all open tabs',
            schema: z.object({}),
            handler: async () => {
                const count = this.app.tabs.length;
                const success = await this.app.closeAllTabs();

                if (success) {
                    this.logger.info(`Closed all ${count} tabs`);
                    return {
                        content: [{ type: 'text', text: JSON.stringify({ success: true, message: `Closed ${count} tabs` }) }]
                    };
                } else {
                    return {
                        content: [{ type: 'text', text: JSON.stringify({ success: false, error: 'Some tabs blocked closure' }) }]
                    };
                }
            }
        };
    }

    private createDuplicateTabTool(): McpTool {
        return {
            name: 'duplicate_tab',
            description: 'Duplicate the active tab or a specific tab',
            schema: z.object({
                tabIndex: z.number().optional().describe('Index of the tab to duplicate (default: active tab)')
            }),
            handler: async (params: { tabIndex?: number }) => {
                const { tabIndex } = params;

                let tab: BaseTabComponent | null;
                if (tabIndex !== undefined) {
                    if (tabIndex < 0 || tabIndex >= this.app.tabs.length) {
                        return {
                            content: [{ type: 'text', text: JSON.stringify({ success: false, error: `Invalid tab index: ${tabIndex}` }) }]
                        };
                    }
                    tab = this.app.tabs[tabIndex];
                } else {
                    tab = this.app.activeTab;
                }

                if (!tab) {
                    return {
                        content: [{ type: 'text', text: JSON.stringify({ success: false, error: 'No tab to duplicate' }) }]
                    };
                }

                const newTab = await this.app.duplicateTab(tab);

                if (newTab) {
                    this.logger.info(`Duplicated tab: ${tab.title}`);
                    return {
                        content: [{ type: 'text', text: JSON.stringify({ success: true, message: `Duplicated tab: ${tab.title}`, newTabIndex: this.app.tabs.indexOf(newTab) }) }]
                    };
                } else {
                    return {
                        content: [{ type: 'text', text: JSON.stringify({ success: false, error: 'Failed to duplicate tab' }) }]
                    };
                }
            }
        };
    }

    private createNextTabTool(): McpTool {
        return {
            name: 'next_tab',
            description: 'Switch to the next tab',
            schema: z.object({}),
            handler: async () => {
                this.app.nextTab();
                const currentTab = this.app.activeTab;

                this.logger.info(`Switched to next tab: ${currentTab?.title}`);
                return {
                    content: [{ type: 'text', text: JSON.stringify({ success: true, currentTab: currentTab?.title }) }]
                };
            }
        };
    }

    private createPreviousTabTool(): McpTool {
        return {
            name: 'previous_tab',
            description: 'Switch to the previous tab',
            schema: z.object({}),
            handler: async () => {
                this.app.previousTab();
                const currentTab = this.app.activeTab;

                this.logger.info(`Switched to previous tab: ${currentTab?.title}`);
                return {
                    content: [{ type: 'text', text: JSON.stringify({ success: true, currentTab: currentTab?.title }) }]
                };
            }
        };
    }

    private createMoveTabLeftTool(): McpTool {
        return {
            name: 'move_tab_left',
            description: 'Move the active tab to the left',
            schema: z.object({}),
            handler: async () => {
                this.app.moveSelectedTabLeft();
                const currentTab = this.app.activeTab;
                const index = currentTab ? this.app.tabs.indexOf(currentTab) : -1;

                this.logger.info(`Moved tab left: ${currentTab?.title}`);
                return {
                    content: [{ type: 'text', text: JSON.stringify({ success: true, tabTitle: currentTab?.title, newIndex: index }) }]
                };
            }
        };
    }

    private createMoveTabRightTool(): McpTool {
        return {
            name: 'move_tab_right',
            description: 'Move the active tab to the right',
            schema: z.object({}),
            handler: async () => {
                this.app.moveSelectedTabRight();
                const currentTab = this.app.activeTab;
                const index = currentTab ? this.app.tabs.indexOf(currentTab) : -1;

                this.logger.info(`Moved tab right: ${currentTab?.title}`);
                return {
                    content: [{ type: 'text', text: JSON.stringify({ success: true, tabTitle: currentTab?.title, newIndex: index }) }]
                };
            }
        };
    }

    private createReopenLastTabTool(): McpTool {
        return {
            name: 'reopen_last_tab',
            description: 'Reopen the last closed tab',
            schema: z.object({}),
            handler: async () => {
                const tab = await this.app.reopenLastTab();

                if (tab) {
                    this.logger.info(`Reopened tab: ${tab.title}`);
                    return {
                        content: [{ type: 'text', text: JSON.stringify({ success: true, tabTitle: tab.title }) }]
                    };
                } else {
                    return {
                        content: [{ type: 'text', text: JSON.stringify({ success: false, error: 'No tab to reopen' }) }]
                    };
                }
            }
        };
    }

    // ============= Profile/Session Operations =============

    private createListProfilesTool(): McpTool {
        return {
            name: 'list_profiles',
            description: `List all available terminal profiles (local shell, SSH connections, etc.).
Returns profileId which can be used directly with open_profile().

Workflow: list_profiles() -> find desired profile -> open_profile(profileId="...")`,
            schema: z.object({}),
            handler: async () => {
                try {
                    const profiles = await this.profilesService.getProfiles();
                    // Use 'profileId' to match open_profile parameter name
                    const formatted = profiles.map(p => ({
                        profileId: p.id,  // Field name matches open_profile's parameter
                        name: p.name,
                        type: p.type,
                        group: p.group,
                        icon: p.icon,
                        color: p.color
                    }));

                    this.logger.info(`Listed ${profiles.length} profiles`);
                    return {
                        content: [{ type: 'text', text: JSON.stringify({ success: true, profiles: formatted, count: profiles.length }, null, 2) }]
                    };
                } catch (error: any) {
                    this.logger.error('Error listing profiles:', error);
                    return {
                        content: [{ type: 'text', text: JSON.stringify({ success: false, error: error.message }) }]
                    };
                }
            }
        };
    }

    private createOpenProfileTool(): McpTool {
        return {
            name: 'open_profile',
            description: `Open a NEW terminal tab using a profile. Creates new connection.

Usage: list_profiles() -> open_profile(profileId="...from list_profiles result")

Parameters:
- profileId: Use 'profileId' field from list_profiles (recommended)
- profileName: Or match by name (partial, case-insensitive)
- waitForReady: Wait for terminal/SSH to fully connect (default: true)
- timeout: Timeout in ms when waiting (default: 30000)

Returns sessionId for immediate use with exec_command, SFTP tools, etc.

Response state fields:
- tabReady: Tab/frontend initialized
- sshConnected: SSH connection established (SSH profiles only)
- ready: OVERALL ready state (for SSH: tabReady AND sshConnected)

For SSH profiles, waits until sshSession.open=true (real connection established).

NOTE: This opens a NEW tab. For existing connections, use get_session_list + exec_command.`,
            schema: z.object({
                profileId: z.string().optional().describe('profileId from list_profiles result'),
                profileName: z.string().optional().describe('Profile name (partial match, case-insensitive)'),
                waitForReady: z.boolean().optional().describe('Wait for connection (default: true for SSH, false for local)'),
                timeout: z.number().optional().describe('Timeout in ms when waiting (default: 30000)')
            }),
            handler: async (params: { profileId?: string; profileName?: string; waitForReady?: boolean; timeout?: number }) => {
                // Debug: log received params to diagnose parameter passing issues
                this.logger.info(`[open_profile] Received params: ${JSON.stringify(params)}`);

                // Handle both direct params and potential nested structure
                const profileId = params?.profileId;
                const profileName = params?.profileName;
                const timeout = params?.timeout ?? 30000;

                this.logger.debug(`[open_profile] Parsed: profileId=${profileId}, profileName=${profileName}`);

                if (!profileId && !profileName) {
                    return {
                        content: [{
                            type: 'text',
                            text: JSON.stringify({
                                success: false,
                                error: 'Either profileId or profileName must be provided',
                                receivedParams: Object.keys(params || {}),
                                hint: 'Use list_profiles to get available profile IDs and names'
                            })
                        }]
                    };
                }

                try {
                    const profiles = await this.profilesService.getProfiles();
                    let profile = profiles.find(p =>
                        (profileId && p.id === profileId) ||
                        (profileName && p.name.toLowerCase().includes(profileName.toLowerCase()))
                    );

                    if (!profile) {
                        this.logger.warn(`[open_profile] Profile not found: ${profileId || profileName}`);
                        return {
                            content: [{
                                type: 'text', text: JSON.stringify({
                                    success: false,
                                    error: `Profile not found: ${profileId || profileName}`,
                                    availableProfiles: profiles.map(p => ({ id: p.id, name: p.name }))
                                })
                            }]
                        };
                    }

                    return await this.openProfileTabAndBuildResponse(profile, params, 'open_profile');
                } catch (error: any) {
                    this.logger.error('[open_profile] Error:', error);
                    return {
                        content: [{ type: 'text', text: JSON.stringify({ success: false, error: error.message }) }]
                    };
                }
            }
        };
    }

    private createShowProfileSelectorTool(): McpTool {
        return {
            name: 'show_profile_selector',
            description: `Show the profile selector dialog for the user to choose a profile.
This is a NON-BLOCKING operation - it immediately returns after opening the dialog.
The dialog will be shown to the user, but this tool does not wait for user selection.
Use list_profiles + open_profile for programmatic profile opening instead.`,
            schema: z.object({}),
            handler: async () => {
                try {
                    // Fire-and-forget: show the dialog but don't wait for result
                    // This prevents MCP from blocking indefinitely
                    this.profilesService.showProfileSelector().then(profile => {
                        if (profile) {
                            this.logger.info(`User selected profile via dialog: ${profile.name}`);
                        } else {
                            this.logger.info('User cancelled profile selector dialog');
                        }
                    }).catch(err => {
                        this.logger.warn('Profile selector dialog closed:', err?.message || 'unknown');
                    });

                    // Return immediately - don't wait for user action
                    this.logger.info('Profile selector dialog opened (non-blocking)');
                    return {
                        content: [{
                            type: 'text', text: JSON.stringify({
                                success: true,
                                message: 'Profile selector dialog opened',
                                note: 'This is non-blocking. Use list_profiles + open_profile for programmatic control.',
                                hint: 'The user can now select a profile from the dialog'
                            })
                        }]
                    };
                } catch (error: any) {
                    const errorMessage = error?.message || (typeof error === 'string' ? error : 'Unknown error showing profile selector');
                    this.logger.error('Error showing profile selector:', error);
                    return {
                        content: [{ type: 'text', text: JSON.stringify({ success: false, error: errorMessage }) }]
                    };
                }
            }
        };
    }

    private createQuickConnectTool(): McpTool {
        return {
            name: 'quick_connect',
            description: `Quick connection - creates a NEW tab using the best matching provider.

IMPORTANT: This creates a NEW connection and tab, does NOT reuse existing sessions.
- For new connections: Use this or open_profile
- For existing sessions: Use get_session_list to find sessions, then exec_command
- Uses the same tab/session/ready return chain as open_profile
- protocol='auto' prefers SSH for user@host style input instead of relying on provider order

Examples:
- quick_connect(query="root@192.168.1.1")
- quick_connect(query="user@host:2222")
- quick_connect(query="telnet://host:23", protocol="auto")
- quick_connect(query="host:9000", protocol="socket")`,
            schema: z.object({
                query: z.string().describe('Connection target, e.g. user@host, user@host:port, telnet://host:23, socket://host:9000, serial:///dev/ttyUSB0'),
                protocol: z.enum(['auto', 'ssh', 'telnet', 'socket', 'serial']).optional().describe('Protocol selection strategy (default: auto)'),
                waitForReady: z.boolean().optional().describe('Wait for connection readiness (default: true for SSH, false for most others)'),
                timeout: z.number().optional().describe('Timeout in ms when waiting (default: 30000)')
            }),
            handler: async (params: { query: string; protocol?: 'auto' | 'ssh' | 'telnet' | 'socket' | 'serial'; waitForReady?: boolean; timeout?: number }) => {
                // Debug: log received params
                this.logger.debug(`quick_connect received params: ${JSON.stringify(params)}`);

                // Safely extract query with validation
                const query = params?.query;

                // Validate query parameter
                if (!query || typeof query !== 'string') {
                    return {
                        content: [{
                            type: 'text',
                            text: JSON.stringify({
                                success: false,
                                error: 'Connection query string is required',
                                hint: 'Provide a connection string like "user@host" or "user@host:port"',
                                receivedParams: Object.keys(params || {})
                            })
                        }]
                    };
                }

                try {
                    const resolution = this.resolveQuickConnectTarget(query, params?.protocol ?? 'auto');

                    if (!resolution.provider && resolution.resolvedProtocol !== 'ssh') {
                        return {
                            content: [{
                                type: 'text', text: JSON.stringify({
                                    success: false,
                                    error: resolution.error || 'Quick connect target could not be resolved',
                                    hint: resolution.hint
                                })
                            }]
                        };
                    }

                    const profile = resolution.resolvedProtocol === 'ssh'
                        ? this.buildSshQuickConnectProfile(resolution.normalizedQuery)
                        : resolution.provider!.quickConnect(resolution.normalizedQuery);

                    if (!profile) {
                        return {
                            content: [{
                                type: 'text', text: JSON.stringify({
                                    success: false,
                                    error: `Invalid ${resolution.resolvedProtocol} quick connect target`,
                                    hint: resolution.resolvedProtocol === 'ssh'
                                        ? 'Use format user@host, user@host:port, ssh://user@host, or ssh://user@host:port'
                                        : resolution.resolvedProtocol === 'telnet'
                                            ? 'Use format host:port or telnet://host:port'
                                            : resolution.resolvedProtocol === 'socket'
                                                ? 'Use format host:port or socket://host:port'
                                                : 'Use format COM3, /dev/ttyUSB0, or serial:///dev/ttyUSB0'
                                })
                            }]
                        };
                    }

                    profile.type = profile.type || resolution.resolvedProtocol;
                    return await this.openProfileTabAndBuildResponse(profile, params, 'quick_connect');
                } catch (error: any) {
                    this.logger.error('Error with quick connect:', error);
                    return {
                        content: [{ type: 'text', text: JSON.stringify({ success: false, error: error.message || 'Unknown error during quick connect' }) }]
                    };
                }
            }
        };
    }

    // ============= Extended Tab / Workspace Management =============

    private okResp (data: any): any {
        return { content: [{ type: 'text', text: JSON.stringify(data) }] };
    }

    private errResp (error: string, hint?: string): any {
        return { content: [{ type: 'text', text: JSON.stringify({ success: false, error, hint }) }] };
    }

    private createRenameWorkspaceTool(): McpTool {
        return {
            name: 'rename_workspace',
            description: 'Rename a top-level workspace/tab. Pass an empty name to restore the automatic title.',
            schema: z.object({
                tabId: z.string().optional().describe('Stable tab ID (recommended)'),
                tabIndex: z.number().optional().describe('Index from list_tabs'),
                title: z.string().optional().describe('Current title (partial match)'),
                name: z.string().describe('New name; empty string clears the custom title'),
            }),
            handler: async (params: { tabId?: string; tabIndex?: number; title?: string; name: string }) => {
                const tab = this.findTabByLocator({ tabId: params.tabId, tabIndex: params.tabIndex, title: params.title });
                if (!tab) {
                    return this.errResp('No matching tab found');
                }
                (tab as any).customTitle = params.name;
                if (params.name) {
                    (tab as any).setTitle?.(params.name);
                } else {
                    (tab as any).updateTitle?.();
                }
                this.app.emitTabsChanged();
                return this.okResp({ success: true, tabId: this.getOrCreateTabId(tab), name: params.name });
            }
        };
    }

    private createRenameSessionTool(): McpTool {
        return {
            name: 'rename_session',
            description: 'Rename a session tab (a pane/tab inside a workspace). Empty name clears the custom title.',
            schema: z.object({
                sessionId: z.string().optional().describe('Stable session ID (recommended)'),
                tabIndex: z.number().optional().describe('Session index from get_session_list (NOT the workspace index)'),
                title: z.string().optional().describe('Current title (partial match)'),
                profileName: z.string().optional().describe('Match by profile name'),
                name: z.string().describe('New name; empty string clears the custom title'),
            }),
            handler: async (params: { sessionId?: string; tabIndex?: number; title?: string; profileName?: string; name: string }) => {
                const session = this.terminalTools.findSessionByLocator({
                    sessionId: params.sessionId, tabIndex: params.tabIndex, title: params.title, profileName: params.profileName,
                });
                if (!session) {
                    return this.errResp('No matching session found');
                }
                (session.tab as any).customTitle = params.name;
                const workspace: any = this.app.getParentTab(session.tab);
                workspace?.updateTitle?.();
                this.app.emitTabsChanged();
                return this.okResp({ success: true, sessionId: session.sessionId, name: params.name });
            }
        };
    }

    private createMoveTabToIndexTool(): McpTool {
        return {
            name: 'move_tab_to_index',
            description: 'Move a top-level workspace/tab to an absolute position in the tab bar (pinned tabs stay in the pinned range).',
            schema: z.object({
                tabId: z.string().optional().describe('Stable tab ID (recommended)'),
                tabIndex: z.number().optional().describe('Current index from list_tabs'),
                title: z.string().optional().describe('Current title (partial match)'),
                toIndex: z.number().describe('Target index in the tab bar (0-based)'),
            }),
            handler: async (params: { tabId?: string; tabIndex?: number; title?: string; toIndex: number }) => {
                const tab = this.findTabByLocator({ tabId: params.tabId, tabIndex: params.tabIndex, title: params.title });
                if (!tab) {
                    return this.errResp('No matching tab found');
                }
                this.app.moveTabToIndex(tab, params.toIndex);
                return this.okResp({ success: true, tabId: this.getOrCreateTabId(tab), newIndex: this.app.tabs.indexOf(tab) });
            }
        };
    }

    private createMoveSessionToIndexTool(): McpTool {
        return {
            name: 'move_session_to_index',
            description: 'Reorder a session tab within its pane\'s tab strip (does not move it to another pane/workspace).',
            schema: z.object({
                sessionId: z.string().optional().describe('Stable session ID (recommended)'),
                tabIndex: z.number().optional().describe('Session index from get_session_list'),
                title: z.string().optional().describe('Current title (partial match)'),
                profileName: z.string().optional().describe('Match by profile name'),
                position: z.number().describe('Target position within the pane tab strip (0-based)'),
            }),
            handler: async (params: { sessionId?: string; tabIndex?: number; title?: string; profileName?: string; position: number }) => {
                const session = this.terminalTools.findSessionByLocator({
                    sessionId: params.sessionId, tabIndex: params.tabIndex, title: params.title, profileName: params.profileName,
                });
                if (!session) {
                    return this.errResp('No matching session found');
                }
                const tab: any = session.tab;
                const workspace: any = this.app.getParentTab(tab);
                const pane: any = workspace?.getPaneOf?.(tab);
                if (!pane || !Array.isArray(pane.tabs)) {
                    return this.errResp('Session is not inside a pane');
                }
                const from = pane.tabs.indexOf(tab);
                const to = Math.max(0, Math.min(params.position, pane.tabs.length - 1));
                pane.tabs.splice(from, 1);
                pane.tabs.splice(to, 0, tab);
                pane.activeTab = tab;
                workspace.focus?.(tab);
                workspace.layout?.();
                workspace.updateTitle?.();
                this.app.emitTabsChanged();
                return this.okResp({ success: true, sessionId: session.sessionId, position: to });
            }
        };
    }

    private createDuplicateWorkspaceTool(): McpTool {
        return {
            name: 'duplicate_workspace',
            description: 'Duplicate a whole workspace (all panes) as a new top-level tab.',
            schema: z.object({
                tabId: z.string().optional().describe('Stable tab ID (recommended)'),
                tabIndex: z.number().optional().describe('Index from list_tabs (default: active)'),
                title: z.string().optional().describe('Current title (partial match)'),
            }),
            handler: async (params: { tabId?: string; tabIndex?: number; title?: string }) => {
                const tab = (params.tabId || params.tabIndex !== undefined || params.title)
                    ? this.findTabByLocator({ tabId: params.tabId, tabIndex: params.tabIndex, title: params.title })
                    : this.app.activeTab;
                if (!tab || !(tab instanceof SplitTabComponent)) {
                    return this.errResp('Target is not a workspace');
                }
                const dup = await this.app.duplicateTab(tab);
                if (!dup) {
                    return this.errResp('Failed to duplicate workspace');
                }
                return this.okResp({ success: true, tabId: this.getOrCreateTabId(dup), newIndex: this.app.tabs.indexOf(dup) });
            }
        };
    }

    private createDuplicateSessionTool(): McpTool {
        return {
            name: 'duplicate_session',
            description: 'Duplicate a session (pane/tab) inside its own workspace, keeping the copy in the same pane.',
            schema: z.object({
                sessionId: z.string().optional().describe('Stable session ID (recommended)'),
                tabIndex: z.number().optional().describe('Session index from get_session_list'),
                title: z.string().optional().describe('Current title (partial match)'),
                profileName: z.string().optional().describe('Match by profile name'),
            }),
            handler: async (params: { sessionId?: string; tabIndex?: number; title?: string; profileName?: string }) => {
                const session = this.terminalTools.findSessionByLocator({
                    sessionId: params.sessionId, tabIndex: params.tabIndex, title: params.title, profileName: params.profileName,
                });
                if (!session) {
                    return this.errResp('No matching session found');
                }
                const workspace: any = this.app.getParentTab(session.tab);
                if (typeof workspace?.duplicateSession !== 'function') {
                    return this.errResp('Workspace does not support duplicating sessions');
                }
                const dup: any = await workspace.duplicateSession(session.tab);
                if (!dup) {
                    return this.errResp('Failed to duplicate session');
                }
                return this.okResp({
                    success: true,
                    sourceSessionId: session.sessionId,
                    sessionId: this.terminalTools.getOrCreateSessionId(dup),
                });
            }
        };
    }

    private createCreateWorkspaceTool(): McpTool {
        return {
            name: 'create_workspace',
            description: 'Create a new empty workspace (a top-level tab that can host panes).',
            schema: z.object({}),
            handler: async () => {
                const workspace: any = (this.app as any).createWorkspaceTab();
                if (!workspace) {
                    return this.errResp('Failed to create workspace');
                }
                return this.okResp({ success: true, tabId: this.getOrCreateTabId(workspace), tabIndex: this.app.tabs.indexOf(workspace) });
            }
        };
    }

    private createCloseSessionTool(): McpTool {
        return {
            name: 'close_session',
            description: 'Close a single session (pane/tab) without closing the whole workspace. The workspace closes if it was the last pane.',
            schema: z.object({
                sessionId: z.string().optional().describe('Stable session ID (recommended)'),
                tabIndex: z.number().optional().describe('Session index from get_session_list'),
                title: z.string().optional().describe('Current title (partial match)'),
                profileName: z.string().optional().describe('Match by profile name'),
                force: z.boolean().optional().describe('Skip the running-process check (default: false)'),
            }),
            handler: async (params: { sessionId?: string; tabIndex?: number; title?: string; profileName?: string; force?: boolean }) => {
                const session = this.terminalTools.findSessionByLocator({
                    sessionId: params.sessionId, tabIndex: params.tabIndex, title: params.title, profileName: params.profileName,
                });
                if (!session) {
                    return this.errResp('No matching session found');
                }
                const tab: any = session.tab;
                if (!params.force && typeof tab.canClose === 'function') {
                    const canClose = await tab.canClose();
                    if (!canClose) {
                        return this.errResp('Session refused to close (running process)', 'Pass force=true to override');
                    }
                }
                await tab.destroy?.();
                return this.okResp({ success: true, sessionId: session.sessionId });
            }
        };
    }

    private createTogglePinTool(): McpTool {
        return {
            name: 'toggle_pin',
            description: 'Pin or unpin a top-level workspace/tab.',
            schema: z.object({
                tabId: z.string().optional().describe('Stable tab ID (recommended)'),
                tabIndex: z.number().optional().describe('Index from list_tabs (default: active)'),
                title: z.string().optional().describe('Current title (partial match)'),
            }),
            handler: async (params: { tabId?: string; tabIndex?: number; title?: string }) => {
                const tab = (params.tabId || params.tabIndex !== undefined || params.title)
                    ? this.findTabByLocator({ tabId: params.tabId, tabIndex: params.tabIndex, title: params.title })
                    : this.app.activeTab;
                if (!tab) {
                    return this.errResp('No matching tab found');
                }
                this.app.toggleTabPinned(tab);
                return this.okResp({ success: true, tabId: this.getOrCreateTabId(tab), pinned: tab.pinned });
            }
        };
    }

    private createSetWorkspaceColorTool(): McpTool {
        return {
            name: 'set_workspace_color',
            description: 'Set or clear a top-level workspace/tab color. Pass null/empty to clear.',
            schema: z.object({
                tabId: z.string().optional().describe('Stable tab ID (recommended)'),
                tabIndex: z.number().optional().describe('Index from list_tabs (default: active)'),
                title: z.string().optional().describe('Current title (partial match)'),
                color: z.string().nullable().optional().describe('CSS color, e.g. "#e11d48"; null/empty clears'),
            }),
            handler: async (params: { tabId?: string; tabIndex?: number; title?: string; color?: string | null }) => {
                const tab = (params.tabId || params.tabIndex !== undefined || params.title)
                    ? this.findTabByLocator({ tabId: params.tabId, tabIndex: params.tabIndex, title: params.title })
                    : this.app.activeTab;
                if (!tab) {
                    return this.errResp('No matching tab found');
                }
                (tab as any).color = params.color || null;
                this.app.emitTabsChanged();
                return this.okResp({ success: true, tabId: this.getOrCreateTabId(tab), color: (tab as any).color });
            }
        };
    }

    private createToggleFocusAllTool(): McpTool {
        return {
            name: 'toggle_focus_all',
            description: 'Toggle "focus all sessions" (broadcast input to every pane) for a workspace.',
            schema: z.object({
                tabId: z.string().optional().describe('Stable tab ID (recommended)'),
                tabIndex: z.number().optional().describe('Index from list_tabs (default: active)'),
                title: z.string().optional().describe('Current title (partial match)'),
            }),
            handler: async (params: { tabId?: string; tabIndex?: number; title?: string }) => {
                const tab = (params.tabId || params.tabIndex !== undefined || params.title)
                    ? this.findTabByLocator({ tabId: params.tabId, tabIndex: params.tabIndex, title: params.title })
                    : this.app.activeTab;
                if (!tab || !(tab instanceof SplitTabComponent) || typeof (tab as any).toggleFocusAll !== 'function') {
                    return this.errResp('Target is not a workspace');
                }
                (tab as any).toggleFocusAll();
                return this.okResp({ success: true, tabId: this.getOrCreateTabId(tab), focusAllMode: (tab as any).focusAllMode });
            }
        };
    }

    // ============= Cross-workspace Move =============

    /**
     * Move a terminal session (pane/tab) from its current workspace into
     * another workspace in the same window.
     */
    private createMovePaneToWorkspaceTool(): McpTool {
        return {
            name: 'move_pane_to_workspace',
            description: `Move a terminal session (pane or tab) into another workspace.

Source: sessionId (recommended) > tabIndex (from get_session_list) > title > profileName
Target workspace: targetWorkspaceIndex (from list_tabs) or targetWorkspaceTitle (partial match)
Placement:
- mode='pane' (default): creates a NEW pane in the target workspace at 'side'
- mode='tab': merges the session into the target workspace's focused pane as a tab
Optional targetSessionId: place the new pane relative to that session in the target workspace

The moved session keeps running (same process). If the source workspace becomes empty it is closed.`,
            schema: z.object({
                sessionId: z.string().optional().describe('Stable session ID of the session to move'),
                tabIndex: z.number().optional().describe('Session index from get_session_list'),
                title: z.string().optional().describe('Match source session by title'),
                profileName: z.string().optional().describe('Match source session by profile name'),
                targetWorkspaceIndex: z.number().optional().describe('Target workspace index from list_tabs'),
                targetWorkspaceTitle: z.string().optional().describe('Target workspace title (partial match)'),
                targetSessionId: z.string().optional().describe('Place relative to this session in the target workspace'),
                mode: z.enum(['pane', 'tab']).optional().describe("'pane' = new split (default), 'tab' = merge into focused pane"),
                side: z.enum(['r', 'l', 't', 'b', 'right', 'left', 'top', 'bottom']).optional().describe('Split side for mode=pane (default: r)'),
            }),
            handler: async (params: {
                sessionId?: string;
                tabIndex?: number;
                title?: string;
                profileName?: string;
                targetWorkspaceIndex?: number;
                targetWorkspaceTitle?: string;
                targetSessionId?: string;
                mode?: 'pane' | 'tab';
                side?: string;
            }) => {
                const session = this.terminalTools.findSessionByLocator({
                    sessionId: params.sessionId,
                    tabIndex: params.tabIndex,
                    title: params.title,
                    profileName: params.profileName,
                });
                if (!session) {
                    return {
                        content: [{ type: 'text', text: JSON.stringify({ success: false, error: 'No matching source session found', hint: 'Use get_session_list to see sessions' }) }]
                    };
                }

                const sourceTab: any = session.tab;
                const sourceWorkspace: any = this.app.getParentTab(sourceTab);
                if (!sourceWorkspace || typeof sourceWorkspace.removeTab !== 'function') {
                    return {
                        content: [{ type: 'text', text: JSON.stringify({ success: false, error: 'Source session is not inside a workspace' }) }]
                    };
                }

                let targetWorkspace: any = null;
                if (params.targetWorkspaceIndex !== undefined) {
                    targetWorkspace = this.app.tabs[params.targetWorkspaceIndex] ?? null;
                } else if (params.targetWorkspaceTitle) {
                    const needle = params.targetWorkspaceTitle.toLowerCase();
                    targetWorkspace = this.app.tabs.find(tab => (tab.title ?? '').toLowerCase().includes(needle)) ?? null;
                }
                if (!targetWorkspace || typeof targetWorkspace.addTabAt !== 'function') {
                    return {
                        content: [{ type: 'text', text: JSON.stringify({ success: false, error: 'Target workspace not found', hint: 'Pass targetWorkspaceIndex from list_tabs; only workspace tabs can receive panes' }) }]
                    };
                }
                if (targetWorkspace === sourceWorkspace) {
                    return {
                        content: [{ type: 'text', text: JSON.stringify({ success: false, error: 'Source and target are the same workspace' }) }]
                    };
                }

                const sideMap: Record<string, 'r' | 'l' | 't' | 'b'> = {
                    r: 'r', right: 'r', l: 'l', left: 'l', t: 't', top: 't', b: 'b', bottom: 'b',
                };
                const side = sideMap[params.side ?? 'r'] ?? 'r';
                const mode = params.mode ?? 'pane';

                let relative: any = null;
                if (params.targetSessionId) {
                    const targetSession = this.terminalTools.findSessionByLocator({ sessionId: params.targetSessionId });
                    relative = targetSession?.tab ?? null;
                }
                if (!relative) {
                    relative = targetWorkspace.getFocusedTab?.() ?? targetWorkspace.getAllTabs?.()[0] ?? null;
                }

                const fromTitle = sourceWorkspace.title;
                const toTitle = targetWorkspace.title;

                try {
                    // The target workspace's view container only exists once its
                    // view has been initialized; select it first and wait.
                    this.app.selectTab(targetWorkspace);
                    if (!targetWorkspace.viewContainer) {
                        await targetWorkspace.initialized$?.toPromise?.();
                    }

                    if (mode === 'tab' && typeof targetWorkspace.addTabToPane === 'function') {
                        // addTabToPane() adopts the session, detaching it from
                        // its previous workspace.
                        await targetWorkspace.addTabToPane(sourceTab);
                    } else {
                        sourceWorkspace.removeTab(sourceTab);
                        await targetWorkspace.addTabAt(sourceTab, relative, side);
                    }

                    targetWorkspace.focus?.(sourceTab);
                    this.app.selectTab(targetWorkspace);

                    this.logger.info(`Moved session ${session.sessionId} from "${fromTitle}" to "${toTitle}" (${mode}, ${side})`);
                    return {
                        content: [{ type: 'text', text: JSON.stringify({
                            success: true,
                            sessionId: session.sessionId,
                            from: fromTitle,
                            to: toTitle,
                            mode,
                            side: mode === 'pane' ? side : undefined,
                            paneCount: this.countPanes(targetWorkspace),
                        }) }]
                    };
                } catch (error: any) {
                    this.logger.error('Error moving pane between workspaces:', error);
                    return {
                        content: [{ type: 'text', text: JSON.stringify({ success: false, error: error.message || 'Failed to move pane' }) }]
                    };
                }
            }
        };
    }

    // ============= Split Pane Operations =============

    /**
     * Count real panes, not tabs: a pane may host several background tabs.
     */
    private countPanes (workspace: any): number {
        const foreground = workspace?.getForegroundTabs?.();
        if (Array.isArray(foreground)) {
            return foreground.length;
        }
        return workspace?.getAllTabs?.().length ?? 0;
    }

    private createSplitTabTool(): McpTool {
        return {
            name: 'split_tab',
            description: `Split the current terminal pane in a direction.
Creates a new pane with a copy of the current terminal.
Direction: 'right'/'left'/'top'/'bottom' (or shorthand 'r'/'l'/'t'/'b')
The active tab must be inside a SplitTabComponent, or be a terminal that can be wrapped.`,
            schema: z.object({
                direction: z.enum(['horizontal', 'vertical', 'right', 'left', 'top', 'bottom', 'r', 'l', 't', 'b'])
                    .describe('Split direction: right/left/top/bottom (or r/l/t/b), or horizontal/vertical'),
                ratio: z.number().optional().describe('Split ratio (0.1 to 0.9, default: 0.5) - not yet implemented')
            }),
            handler: async (params: { direction: string; ratio?: number }) => {
                const { direction } = params;

                // Map direction to SplitDirection ('t', 'r', 'b', 'l')
                let splitDir: 'r' | 'l' | 't' | 'b';
                let positionLabel: string;
                switch (direction) {
                    case 'right':
                    case 'r':
                    case 'horizontal':
                        splitDir = 'r';
                        positionLabel = 'right';
                        break;
                    case 'left':
                    case 'l':
                        splitDir = 'l';
                        positionLabel = 'left';
                        break;
                    case 'top':
                    case 't':
                        splitDir = 't';
                        positionLabel = 'top';
                        break;
                    case 'bottom':
                    case 'b':
                    case 'vertical':
                        splitDir = 'b';
                        positionLabel = 'bottom';
                        break;
                    default:
                        splitDir = 'r';
                        positionLabel = 'right';
                }

                const activeTab = this.app.activeTab;
                if (!activeTab) {
                    return {
                        content: [{ type: 'text', text: JSON.stringify({ success: false, error: 'No active tab' }) }]
                    };
                }

                try {
                    // Check if we're inside a SplitTabComponent
                    if (activeTab instanceof SplitTabComponent) {
                        // Active tab IS a SplitTabComponent - split the focused pane
                        const splitTab = activeTab as SplitTabComponent;
                        // A freshly duplicated/restored workspace may not have a
                        // focused pane yet; fall back to its first session so
                        // splitting still creates a real pane.
                        const focusedPane = splitTab.getFocusedTab() ?? splitTab.getAllTabs()[0] ?? null;

                        if (focusedPane) {
                            // Mirror the manual split hotkey: split relative to
                            // the focused session, so the new pane lands next to
                            // the pane the user is actually looking at.
                            if (typeof (splitTab as any).focus === 'function') {
                                (splitTab as any).focus(focusedPane);
                            }
                            const newTab = await (splitTab as any).splitTab(focusedPane, splitDir);
                            if (newTab) {
                                this.logger.info(`Split pane ${splitDir} in SplitTabComponent`);
                                return {
                                    content: [{
                                        type: 'text', text: JSON.stringify({
                                            success: true,
                                            direction: direction,
                                            message: `Created split pane to the ${positionLabel}`,
                                            paneCount: this.countPanes(splitTab)
                                        })
                                    }]
                                };
                            }
                        }
                    }

                    // Check if the parent is a SplitTabComponent
                    const parent = this.app.getParentTab(activeTab);
                    if (parent && parent instanceof SplitTabComponent) {
                        const splitTab = parent as SplitTabComponent;
                        const newTab = await (splitTab as any).splitTab(activeTab, splitDir);
                        if (newTab) {
                            this.logger.info(`Split tab ${splitDir} (parent is SplitTabComponent)`);
                            return {
                                content: [{
                                    type: 'text', text: JSON.stringify({
                                        success: true,
                                        direction: direction,
                                        message: `Created split pane to the ${positionLabel}`,
                                        paneCount: this.countPanes(splitTab)
                                    })
                                }]
                            };
                        }
                    }

                    // Current tab is not in a split - duplicate and explain
                    // This is the fallback for tabs that are not yet in a SplitTabComponent
                    const newTab = await this.app.duplicateTab(activeTab);
                    if (newTab) {
                        this.logger.info(`Created new tab (split not available for this tab type)`);
                        return {
                            content: [{
                                type: 'text', text: JSON.stringify({
                                    success: true,
                                    direction: direction,
                                    message: `Created new tab to the ${positionLabel} (split not available for this tab type)`,
                                    note: 'Use terminal tabs for true split pane functionality',
                                    fallback: true
                                })
                            }]
                        };
                    }

                    return {
                        content: [{ type: 'text', text: JSON.stringify({ success: false, error: 'Could not create split' }) }]
                    };
                } catch (error: any) {
                    this.logger.error('Error splitting tab:', error);
                    return {
                        content: [{ type: 'text', text: JSON.stringify({ success: false, error: error.message }) }]
                    };
                }
            }
        };
    }
}
