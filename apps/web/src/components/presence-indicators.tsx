import { Chip, Tooltip } from '@heroui/react';
import { Bot, FolderGit2, GitBranch, Github, Globe, Monitor } from 'lucide-react';

const AGENT_PLATFORMS = ['claude-code', 'devin', 'cursor', 'windsurf'] as const;
type AgentPlatform = (typeof AGENT_PLATFORMS)[number];

const PLATFORM_DISPLAY_NAMES: Record<string, string> = {
  'claude-code': 'Claude Code',
  devin: 'Devin',
  cursor: 'Cursor',
  windsurf: 'Windsurf',
  browser: 'Browser',
};

function isAgentPlatform(platform: string): platform is AgentPlatform {
  return AGENT_PLATFORMS.includes(platform as AgentPlatform);
}

function getPlatformDisplayName(platform: string): string {
  return PLATFORM_DISPLAY_NAMES[platform] ?? platform;
}

export interface EnvironmentContext {
  branch?: string;
  projectName?: string;
  hostname?: string;
  repo?: string;
}

export interface BrowserContext {
  browser?: string;
  os?: string;
  lastActive?: number;
}

export interface ConnectedPeer {
  webrtcPeerId: string | undefined;
  platform: string;
  name: string;
  color: string;
  isOwner: boolean;
  connectedAt: number;
  context?: EnvironmentContext;
  browserContext?: BrowserContext;
  hasDaemon?: boolean;
}

function formatLastActive(lastActive: number | undefined): string {
  if (!lastActive) return '';

  const now = Date.now();
  const diffMs = now - lastActive;
  const diffSeconds = Math.floor(diffMs / 1000);

  if (diffSeconds < 60) return 'just now';
  if (diffSeconds < 3600) return `${Math.floor(diffSeconds / 60)}m ago`;
  if (diffSeconds < 86400) return `${Math.floor(diffSeconds / 3600)}h ago`;
  return `${Math.floor(diffSeconds / 86400)}d ago`;
}

interface PresenceIndicatorsProps {
  connectedPeers: ConnectedPeer[];
}

export function PresenceIndicators({ connectedPeers }: PresenceIndicatorsProps) {
  const agents = connectedPeers.filter((p) => isAgentPlatform(p.platform));
  const browsers = connectedPeers.filter((p) => !isAgentPlatform(p.platform));

  const agentCount = agents.length;
  const browserCount = browsers.length;
  const totalPeers = connectedPeers.length;

  if (totalPeers === 0) {
    return null;
  }

  const getPeerDisplayText = () => {
    if (browserCount === 0 && agentCount > 0) {
      return (
        <span className="flex items-center gap-1.5">
          <Bot className="w-3 h-3" />
          {agentCount} {agentCount === 1 ? 'agent' : 'agents'}
        </span>
      );
    }

    if (agentCount === 0 && browserCount > 0) {
      return (
        <span className="flex items-center gap-1.5">
          <Globe className="w-3 h-3" />
          {browserCount} {browserCount === 1 ? 'viewer' : 'viewers'}
        </span>
      );
    }

    return (
      <span className="flex items-center gap-1.5">
        <Globe className="w-3 h-3" />
        {browserCount}
        <span className="text-muted-foreground/50 mx-0.5">+</span>
        <Bot className="w-3 h-3" />
        {agentCount}
      </span>
    );
  };

  const getTooltipContent = () => {
    return (
      <div className="flex flex-col gap-2 py-1">
        {agents.length > 0 && (
          <div className="flex flex-col gap-1.5">
            <span className="text-muted-foreground text-[10px] uppercase tracking-wide">
              Agents
            </span>
            {agents.map((agent, idx) => {
              const lastActiveText = formatLastActive(agent.connectedAt);

              return (
                <div key={`agent-${idx}`} className="flex flex-col gap-1">
                  <div className="flex items-center gap-2">
                    <Bot className="w-3.5 h-3.5 text-accent" />
                    <span className="font-medium">{getPlatformDisplayName(agent.platform)}</span>
                    {agent.name && agent.name !== `Peer ${idx}` && (
                      <span className="text-muted-foreground">({agent.name})</span>
                    )}
                    {lastActiveText && (
                      <span className="text-muted-foreground text-[10px]">- {lastActiveText}</span>
                    )}
                  </div>

                  {agent.context && (
                    <div className="flex flex-col gap-1.5 ml-5 mt-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        {agent.context.branch && (
                          <Chip size="sm" variant="soft" color="accent">
                            <span className="flex items-center gap-1">
                              <GitBranch className="w-3 h-3" />
                              <span className="text-muted-foreground">branch:</span>
                              {agent.context.branch}
                            </span>
                          </Chip>
                        )}
                        {agent.context.projectName && (
                          <Chip size="sm" variant="soft" color="default">
                            <span className="flex items-center gap-1">
                              <FolderGit2 className="w-3 h-3" />
                              <span className="text-muted-foreground">dir:</span>
                              {agent.context.projectName}
                            </span>
                          </Chip>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5">
                        {agent.context.hostname && (
                          <Chip size="sm" variant="soft">
                            <span className="flex items-center gap-1">
                              <Monitor className="w-3 h-3" />
                              <span className="text-muted-foreground">host:</span>
                              {agent.context.hostname}
                            </span>
                          </Chip>
                        )}
                        {agent.context.repo && (
                          <Chip size="sm" variant="soft">
                            <span className="flex items-center gap-1">
                              <Github className="w-3 h-3" />
                              <span className="text-muted-foreground">repo:</span>
                              {agent.context.repo}
                            </span>
                          </Chip>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {browsers.length > 0 && (
          <div className="flex flex-col gap-1.5">
            <span className="text-muted-foreground text-[10px] uppercase tracking-wide">
              Viewers
            </span>
            {browsers.map((browser, idx) => {
              const ctx = browser.browserContext;
              const hasContext = ctx?.browser || ctx?.os;
              const lastActiveText = formatLastActive(ctx?.lastActive);

              return (
                <div key={`browser-${idx}`} className="flex flex-col gap-1">
                  <div className="flex items-center gap-2">
                    <Globe className="w-3.5 h-3.5 text-info" />
                    <span className="font-medium">
                      {browser.name && browser.name !== `Peer ${idx}` ? browser.name : 'Anonymous'}
                    </span>
                    {lastActiveText && (
                      <span className="text-muted-foreground text-[10px]">({lastActiveText})</span>
                    )}
                  </div>

                  {hasContext && (
                    <div className="flex flex-wrap items-center gap-1.5 ml-5 mt-0.5">
                      {ctx?.browser && (
                        <Chip size="sm" variant="soft" color="default">
                          <span className="flex items-center gap-1">{ctx.browser}</span>
                        </Chip>
                      )}
                      {ctx?.os && (
                        <Chip size="sm" variant="soft">
                          <span className="flex items-center gap-1">
                            <Monitor className="w-3 h-3" />
                            {ctx.os}
                          </span>
                        </Chip>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  return (
    <Tooltip delay={0}>
      <Tooltip.Trigger>
        <span className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-default">
          <span className="w-1.5 h-1.5 rounded-full bg-info" />
          {getPeerDisplayText()}
        </span>
      </Tooltip.Trigger>
      <Tooltip.Content className="text-xs">{getTooltipContent()}</Tooltip.Content>
    </Tooltip>
  );
}
