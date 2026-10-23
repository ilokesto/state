import type { BaseLayoutProps, LayoutTab } from 'fumadocs-ui/layouts/shared';
import { appName, gitConfig } from './shared';
import { isPackageName } from './publication';

export const packageMetadata: Record<string, { colorClass: string; cssVarDark: string; cssVarLight: string; fgVarDark: string; fgVarLight: string }> = {
  store: {
    colorClass: 'bg-emerald-500',
    cssVarLight: 'var(--color-emerald-600)',
    cssVarDark: 'var(--color-emerald-400)',
    fgVarLight: 'hsl(0, 0%, 98%)',
    fgVarDark: 'hsl(0, 0%, 9%)',
  },
  state: {
    colorClass: 'bg-blue-500',
    cssVarLight: 'var(--color-blue-600)',
    cssVarDark: 'var(--color-blue-400)',
    fgVarLight: 'hsl(0, 0%, 98%)',
    fgVarDark: 'hsl(0, 0%, 9%)',
  },
  overlay: {
    colorClass: 'bg-cyan-500',
    cssVarLight: 'var(--color-cyan-600)',
    cssVarDark: 'var(--color-cyan-400)',
    fgVarLight: 'hsl(0, 0%, 98%)',
    fgVarDark: 'hsl(0, 0%, 9%)',
  },
  modal: {
    colorClass: 'bg-indigo-500',
    cssVarLight: 'var(--color-indigo-600)',
    cssVarDark: 'var(--color-indigo-400)',
    fgVarLight: 'hsl(0, 0%, 98%)',
    fgVarDark: 'hsl(0, 0%, 9%)',
  },
  toast: {
    colorClass: 'bg-violet-500',
    cssVarLight: 'var(--color-violet-600)',
    cssVarDark: 'var(--color-violet-400)',
    fgVarLight: 'hsl(0, 0%, 98%)',
    fgVarDark: 'hsl(0, 0%, 9%)',
  },
  form: {
    colorClass: 'bg-red-500',
    cssVarLight: 'var(--color-red-600)',
    cssVarDark: 'var(--color-red-400)',
    fgVarLight: 'hsl(0, 0%, 98%)',
    fgVarDark: 'hsl(0, 0%, 9%)',
  },
  utilinent: {
    colorClass: 'bg-amber-500',
    cssVarLight: 'var(--color-amber-600)',
    cssVarDark: 'var(--color-amber-400)',
    fgVarLight: 'hsl(0, 0%, 98%)',
    fgVarDark: 'hsl(0, 0%, 9%)',
  },
  fetcher: {
    colorClass: 'bg-pink-500',
    cssVarLight: 'var(--color-pink-600)',
    cssVarDark: 'var(--color-pink-400)',
    fgVarLight: 'hsl(0, 0%, 98%)',
    fgVarDark: 'hsl(0, 0%, 9%)',
  },
};

function PackageIcon({ pkg }: { pkg: keyof typeof packageMetadata }) {
  return (
    <div className="w-full h-full flex items-center justify-center">
      <div
        className={`size-3 rounded-sm shrink-0 ${packageMetadata[pkg].colorClass}`}
      />
    </div>
  );
}

export function baseOptions(): BaseLayoutProps {
  return {
    nav: {
      // JSX supported
      title: appName,
    },
    githubUrl: `https://github.com/${gitConfig.user}/${gitConfig.repo}`,
  };
}

export function getPackageTabs(lang: string): LayoutTab[] {
  const isKorean = lang === 'ko';

  return [
    {
      title: 'Store',
      description: isKorean
        ? '작고 명확한 vanilla 상태 컨테이너'
        : 'Minimal vanilla state container',
      url: `/${lang}/store`,
      icon: <PackageIcon pkg="store" />,
    },
    {
      title: 'State',
      description: isKorean
        ? '프레임워크 친화적인 상태 관리 도구'
        : 'Framework-friendly state management tools',
      url: `/${lang}/state`,
      icon: <PackageIcon pkg="state" />,
    },
    {
      title: 'Form',
      description: isKorean
        ? '프레임워크 친화적인 폼 상태와 필드 바인딩'
        : 'Framework-friendly form state and field bindings',
      url: `/${lang}/form`,
      icon: <PackageIcon pkg="form" />,
    },
    {
      title: 'Overlay',
      description: isKorean
        ? 'Provider 단위 React 오버레이 런타임'
        : 'Provider-scoped React overlay runtime',
      url: `/${lang}/overlay`,
      icon: <PackageIcon pkg="overlay" />,
    },
    {
      title: 'Modal',
      description: isKorean
        ? '중첩과 포커스를 관리하는 React 모달'
        : 'React modals with stacking and focus management',
      url: `/${lang}/modal`,
      icon: <PackageIcon pkg="modal" />,
    },
    {
      title: 'Toast',
      description: isKorean
        ? '위치와 수명을 관리하는 React 알림'
        : 'React notifications with positioning and lifecycle management',
      url: `/${lang}/toast`,
      icon: <PackageIcon pkg="toast" />,
    },
    {
      title: 'Utilinent',
      description: isKorean
        ? 'React 렌더링 유틸리티'
        : 'React rendering utilities',
      url: `/${lang}/utilinent`,
      icon: <PackageIcon pkg="utilinent" />,
    },
    {
      title: 'Fetcher',
      description: isKorean
        ? 'OpenAPI 타입 안전성을 더한 ky 래퍼'
        : 'OpenAPI-aware ky wrapper',
      url: `/${lang}/fetcher`,
      icon: <PackageIcon pkg="fetcher" />,
    },
  ].filter(tab => isPackageName(tab.url.split('/')[2]));
}
