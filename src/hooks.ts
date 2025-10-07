import { Connection, VersionedTransaction } from "@solana/web3.js";
import { useMutation } from "@tanstack/react-query";
import { Buffer } from "buffer";
import type { JupiterQuoteResponse } from "./App";
import type { WalletContextState } from "@solana/wallet-adapter-react";
window.Buffer = Buffer;

type SwapParams = {
  quoteResponse: JupiterQuoteResponse | undefined;
  wallet: WalletContextState;
};

type SwapResponse = {
  txid: string;
  status: string;
};

export function useSwapMutation() {
  return useMutation<SwapResponse, Error, SwapParams>({
    mutationFn: swapTokens,
    onSuccess: (data) => {
      console.log("Swap sent!", data.txid);
    },
    onError: (err) => {
      console.error("Swap failed:", err);
    },
  });
}

const swapTokens = async ({ quoteResponse, wallet }: SwapParams) => {
  const res = await fetch("https://lite-api.jup.ag/swap/v1/swap", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      quoteResponse: quoteResponse,
      userPublicKey: wallet.publicKey,

      // ADDITIONAL PARAMETERS TO OPTIMIZE FOR TRANSACTION LANDING
      // See next guide to optimize for transaction landing
      dynamicComputeUnitLimit: true,
      dynamicSlippage: true,
      prioritizationFeeLamports: {
        priorityLevelWithMaxLamports: {
          maxLamports: 1000000,
          priorityLevel: "veryHigh",
        },
      },
    }),
  });

  if (!res.ok) throw new Error("Swap request failed");
  const data = await res.json();
  // console.log(data);

  // Jupiter returns a base64-encoded transaction you must sign + send
  const swapTxBuf = Buffer.from(data.swapTransaction, "base64");
  const transaction = VersionedTransaction.deserialize(swapTxBuf);

  // Sign and send
  const connection = new Connection("https://api.devnet.solana.com");
  const txid = await connection.sendRawTransaction(transaction.serialize());

  return { txid, status: "sent" };
};
