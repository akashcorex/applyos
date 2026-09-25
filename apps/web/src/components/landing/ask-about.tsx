import ClaudeMonoIcon from './icons/claude-mono';
import GeminiGoogleMonoIcon from './icons/gemini-google-mono';
import GrokXaiMonoIcon from './icons/grok-xai-mono';
import OpenaiChatgptMonoIcon from './icons/openai-chatgpt-mono';
import PerplexityMonoIcon from './icons/perplexity-mono';

const query = encodeURIComponent(
  'What is ApplyOS? Tell me about the ApplyOS AI job application platform.',
);

const channels = [
  {
    label: 'Ask about ApplyOS on ChatGPT',
    href: `https://chatgpt.com/?q=${query}`,
    Icon: OpenaiChatgptMonoIcon,
  },
  {
    label: 'Ask about ApplyOS on Claude',
    href: `https://claude.ai/new?q=${query}`,
    Icon: ClaudeMonoIcon,
  },
  {
    label: 'Ask about ApplyOS on Perplexity',
    href: `https://www.perplexity.ai/search?q=${query}`,
    Icon: PerplexityMonoIcon,
  },
  {
    label: 'Ask about ApplyOS on Gemini',
    href: `https://gemini.google.com/app?hl=en&q=${query}`,
    Icon: GeminiGoogleMonoIcon,
  },
  {
    label: 'Ask about ApplyOS on Grok',
    href: `https://grok.com/?q=${query}`,
    Icon: GrokXaiMonoIcon,
  },
];

const AskAboutApplyOs = () => {
  return (
    <div className="mt-6 flex items-center gap-4">
      <p className="text-nowrap text-[0.95rem] text-neutral-400">
        Ask about ApplyOS on
      </p>
      <div className="flex items-center gap-2">
        {channels.map(({ label, href, Icon }) => (
          <a
            key={label}
            href={href}
            target="_blank"
            rel="noreferrer"
            aria-label={label}
            title={label}
            className="flex h-10 w-10 items-center justify-center rounded-lg border border-white/10 bg-white/[0.06] text-neutral-400 transition-colors hover:bg-white/[0.12] hover:text-white"
          >
            <Icon className="h-5 w-5" />
          </a>
        ))}
      </div>
    </div>
  );
};

export default AskAboutApplyOs;
