"use client";

import * as React from "react";
import { useAccount, useSwitchChain } from "wagmi";
import {
  DEFAULT_VERIFICATION_ENVIRONMENT,
  VERIFICATION_ENVIRONMENT_QUERY_PARAM,
  VERIFICATION_ENVIRONMENT_STORAGE_KEY,
  getVerificationDeployment,
  parseVerificationEnvironment,
  withVerificationEnvironment,
  type VerificationDeployment,
  type VerificationEnvironment,
} from "@/lib/verification-environment";

type VerificationEnvironmentContextValue = {
  environment: VerificationEnvironment;
  deployment: VerificationDeployment;
  setEnvironment: (environment: VerificationEnvironment) => void;
  withEnvironment: (href: string) => string;
};

const VerificationEnvironmentContext = React.createContext<VerificationEnvironmentContextValue | null>(null);

export function VerificationEnvironmentProvider({ children }: { children: React.ReactNode }) {
  const [environment, setEnvironmentState] = React.useState<VerificationEnvironment>(
    DEFAULT_VERIFICATION_ENVIRONMENT
  );
  const { isConnected } = useAccount();
  const { switchChain } = useSwitchChain();

  React.useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const fromUrl = params.get(VERIFICATION_ENVIRONMENT_QUERY_PARAM);
    const fromStorage = window.localStorage.getItem(VERIFICATION_ENVIRONMENT_STORAGE_KEY);
    const initial = parseVerificationEnvironment(fromUrl || fromStorage);
    setEnvironmentState(initial);
    window.localStorage.setItem(VERIFICATION_ENVIRONMENT_STORAGE_KEY, initial);

    if (fromUrl !== initial) {
      const url = new URL(window.location.href);
      url.searchParams.set(VERIFICATION_ENVIRONMENT_QUERY_PARAM, initial);
      window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
    }
  }, []);

  const setEnvironment = React.useCallback(
    (next: VerificationEnvironment) => {
      setEnvironmentState(next);
      window.localStorage.setItem(VERIFICATION_ENVIRONMENT_STORAGE_KEY, next);

      const url = new URL(window.location.href);
      url.searchParams.set(VERIFICATION_ENVIRONMENT_QUERY_PARAM, next);
      window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
      window.dispatchEvent(new CustomEvent("verificationenvironmentchange", { detail: next }));

      if (isConnected) {
        switchChain({ chainId: getVerificationDeployment(next).chainId });
      }
    },
    [isConnected, switchChain]
  );

  const deployment = React.useMemo(() => getVerificationDeployment(environment), [environment]);
  const addEnvironment = React.useCallback(
    (href: string) => withVerificationEnvironment(href, environment),
    [environment]
  );

  const value = React.useMemo(
    () => ({ environment, deployment, setEnvironment, withEnvironment: addEnvironment }),
    [addEnvironment, deployment, environment, setEnvironment]
  );

  return (
    <VerificationEnvironmentContext.Provider value={value}>
      {children}
    </VerificationEnvironmentContext.Provider>
  );
}

export function useVerificationEnvironment(): VerificationEnvironmentContextValue {
  const value = React.useContext(VerificationEnvironmentContext);
  if (!value) {
    throw new Error("useVerificationEnvironment must be used inside VerificationEnvironmentProvider");
  }
  return value;
}
