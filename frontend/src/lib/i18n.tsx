"use client";

import { createContext, useContext, ReactNode } from "react";

type Messages = { [key: string]: string | Messages };

interface I18nContextValue {
  messages: Messages;
  locale: string;
}

const I18nContext = createContext<I18nContextValue>({ messages: {}, locale: "sl" });

export function I18nProvider({
  messages,
  locale,
  children,
}: {
  messages: Messages;
  locale: string;
  children: ReactNode;
}) {
  return <I18nContext.Provider value={{ messages, locale }}>{children}</I18nContext.Provider>;
}

function resolve(messages: Messages, path: string): string | Messages | undefined {
  let node: string | Messages | undefined = messages;
  for (const part of path.split(".")) {
    if (node === undefined || typeof node === "string") return undefined;
    node = node[part];
  }
  return node;
}

// Namespace sme biti gnezden ("vehicleDetail.swTab"), parametri se vstavijo za {ime}.
export function useTranslations(namespace: string) {
  const { messages } = useContext(I18nContext);
  return (key: string, params?: Record<string, string | number>) => {
    const value = resolve(messages, `${namespace}.${key}`);
    if (typeof value !== "string") return key;
    if (!params) return value;
    return value.replace(/\{(\w+)\}/g, (m, name) => (name in params ? String(params[name]) : m));
  };
}

export function useLocale() {
  return useContext(I18nContext).locale;
}
