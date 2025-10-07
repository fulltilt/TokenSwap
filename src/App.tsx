import { useState } from "react";
import { ArrowDownUp, Settings, Info, Loader2 } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Slider } from "@/components/ui/slider";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { useQuery } from "@tanstack/react-query";
import { LAMPORTS_PER_SOL } from "@solana/web3.js";
import { TOKEN_2022_PROGRAM_ID } from "@solana/spl-token";
import { Spinner } from "./components/ui/spinner";
import { Buffer } from "buffer";
import { useSwapMutation } from "./hooks";
window.Buffer = Buffer;

export interface JupiterQuoteResponse {
  inputMint: string;
  inAmount: string;
  outputMint: string;
  outAmount: string;
  otherAmountThreshold: string;
  swapMode: string;
  slippageBps: number;
  platformFee: null;
  priceImpactPct: string;
  routePlan: RoutePlan[];
  contextSlot: number;
  timeTaken: number;
  swapUsdValue: string;
  simplerRouteUsed: boolean;
  mostReliableAmmsQuoteReport: MostReliableAmmsQuoteReport;
  useIncurredSlippageForQuoting: null;
  otherRoutePlans: null;
  loadedLongtailToken: boolean;
  instructionVersion: null;
}

export interface MostReliableAmmsQuoteReport {
  info: Info;
}

export interface Info {
  Czfq3xZZDmsdGdUyrNLtRhGc47cXcZtLG4crryfu44zE: string;
  BZtgQEyS6eXUXicYPHecYQ7PybqodXQMvkjUbP4R8mUU: string;
}

export interface RoutePlan {
  swapInfo: SwapInfo;
  percent: number;
  bps: number;
}

export interface SwapInfo {
  ammKey: string;
  label: string;
  inputMint: string;
  outputMint: string;
  inAmount: string;
  outAmount: string;
  feeAmount: string;
  feeMint: string;
}

const mintAddresses: Record<string, string> = {
  SOL: "So11111111111111111111111111111111111111112",
  USDC: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
};

// const USDC_MINT = "Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr"; // devnet

export default function SolanaUSDCSwap() {
  const wallet = useWallet();
  const {
    mutate,
    isPending: isSwapPending,
    isSuccess: isSwapSuccess,
    isError: isSwapError,
    data,
  } = useSwapMutation();

  const { connection } = useConnection();
  const [fromAmount, setFromAmount] = useState(1);
  const [toAmount, setToAmount] = useState(0);
  const [fromToken, setFromToken] = useState("SOL");
  const [toToken, setToToken] = useState("USDC");
  const [exchangeRate, setExchangeRate] = useState(1);
  const [slippage, setSlippage] = useState(50);
  const [showSettings, setShowSettings] = useState(false);
  const [quoteResponse, setQuoteResponse] = useState<JupiterQuoteResponse>();

  const { data: balanceData, isPending: isBalancePending } = useQuery<
    Record<string, number>
  >({
    queryKey: ["balanceData", wallet.publicKey],
    queryFn: async () => {
      if (!wallet.publicKey) return { SOL: 0, USDC: 0 };

      try {
        const solBalance = await connection.getBalance(wallet.publicKey);

        // Get all tokens
        const tokens = await connection.getParsedTokenAccountsByOwner(
          wallet.publicKey,
          { programId: TOKEN_2022_PROGRAM_ID }
        );

        // Find USDC
        const usdcAccount = tokens.value.find(
          (acc) => acc.account.data.parsed.info.mint === mintAddresses.USDC
        );

        return {
          SOL: solBalance / LAMPORTS_PER_SOL,
          USDC: usdcAccount?.account.data.parsed.info.tokenAmount.uiAmount || 0,
        };
      } catch (error) {
        console.error("Error fetching SOL balance:", error);
        return { SOL: 0, USDC: 0 };
      }
    },
  });

  const {
    data: swapData,
    // isPending,
    // error,
  } = useQuery<JupiterQuoteResponse>({
    queryKey: ["swapData", fromToken, toToken],
    queryFn: async () => {
      const response = await fetch(
        `https://lite-api.jup.ag/swap/v1/quote?inputMint=${mintAddresses[fromToken]}&outputMint=${mintAddresses[toToken]}&amount=100000000&slippageBps=${slippage}&restrictIntermediateTokens=true`,
        {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": import.meta.env.VITE_JUPITER_KEY,
          },
        }
      );
      const responseData: JupiterQuoteResponse = await response.json();
      setQuoteResponse(responseData);
      const exchangeRate = parseFloat(responseData.outAmount) / 1000000;
      setToAmount(fromAmount * exchangeRate);
      setExchangeRate(exchangeRate);
      return responseData;
    },
  });

  const handleSwapTokens = () => {
    const temp = fromToken;
    setFromToken(toToken);
    setToToken(temp);
    setFromAmount(toAmount);
    setToAmount(fromAmount);
  };

  const handleFromAmountChange = (value: string) => {
    const floatValue = parseFloat(value);
    setFromAmount(floatValue);
    if (value && !isNaN(parseFloat(value))) {
      const rate = fromToken === "SOL" ? exchangeRate : 1 / exchangeRate;
      setToAmount(floatValue * rate);
    } else {
      setToAmount(0);
    }
  };

  const handleMaxClick = () => {
    if (isBalancePending || !balanceData) return;
    const maxAmount = balanceData[fromToken]?.toString() ?? "0";
    handleFromAmountChange(maxAmount);
  };

  // const handleSwap = useMutation({
  //   mutationFn: ,
  //   onSuccess: (data) => {
  //     console.log("Swap sent!", data.txid);
  //   },
  //   onError: (err) => {
  //     console.error("Swap failed:", err);
  //   },
  // });

  const handleSwap = async () => {
    mutate({
      quoteResponse,
      wallet,
    });
  };

  const estimatedFee = 0.000005; // SOL
  const priceImpact = 0.1; // percentage

  return (
    <div className="min-h-screen bg-gradient-to-br from-violet-50 via-purple-50 to-pink-50 dark:from-gray-900 dark:via-purple-900/20 dark:to-gray-900 flex items-center justify-center p-4">
      <Card className="w-full max-w-md shadow-2xl border-2">
        <CardHeader>
          <div className="flex justify-between items-start">
            <div>
              <CardTitle className="text-2xl font-bold bg-gradient-to-r from-violet-600 to-purple-600 bg-clip-text text-transparent">
                Swap Tokens
              </CardTitle>
              <CardDescription className="mt-1">
                Exchange SOL and USDC instantly
              </CardDescription>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setShowSettings(!showSettings)}
            >
              <Settings className="w-5 h-5" />
            </Button>
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          {showSettings && (
            <Card className="border-2 border-violet-200 dark:border-violet-800">
              <CardContent className="pt-6 space-y-4">
                <div>
                  <div className="flex justify-between mb-2">
                    <Label>Slippage Tolerance</Label>
                    <span className="text-sm font-semibold text-violet-600 dark:text-violet-400">
                      {slippage}%
                    </span>
                  </div>
                  <Slider
                    value={[slippage]}
                    onValueChange={(value) => setSlippage(value[0])}
                    min={0.1}
                    max={5}
                    step={0.1}
                    className="w-full"
                  />
                  <div className="flex justify-between mt-2 text-xs text-gray-500">
                    <span>0.1%</span>
                    <span>5%</span>
                  </div>
                </div>
                <div className="flex gap-2">
                  {[0.5, 1, 2, 3].map((value) => (
                    <Button
                      key={value}
                      variant={slippage === value ? "default" : "outline"}
                      size="sm"
                      onClick={() => setSlippage(value)}
                      className="flex-1"
                    >
                      {value}%
                    </Button>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* From Token */}
          <div className="bg-gray-50 dark:bg-gray-800 rounded-xl p-4 space-y-3">
            <div className="flex justify-between items-center">
              <Label className="text-sm text-gray-500 dark:text-gray-400">
                From
              </Label>
              <span className="text-xs text-gray-500 dark:text-gray-400">
                {isBalancePending ? (
                  <Spinner />
                ) : (
                  `Balance: ${balanceData?.SOL} ${fromToken}`
                )}
              </span>
            </div>
            <div className="flex gap-3">
              <Input
                type="number"
                placeholder="0.00"
                value={fromAmount}
                onChange={(e) => handleFromAmountChange(e.target.value)}
                className="text-2xl font-semibold border-0 bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0"
              />
              <div className="flex flex-col gap-2">
                <Select value={fromToken} onValueChange={setFromToken}>
                  <SelectTrigger className="w-[100px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="SOL">SOL</SelectItem>
                    <SelectItem value="USDC">USDC</SelectItem>
                  </SelectContent>
                </Select>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleMaxClick}
                  className="text-xs"
                  disabled={isBalancePending}
                >
                  MAX
                </Button>
              </div>
            </div>
          </div>

          {/* Swap Button */}
          <div className="flex justify-center -my-2 z-10 relative">
            <Button
              variant="outline"
              size="icon"
              onClick={handleSwapTokens}
              className="rounded-full border-4 border-white dark:border-gray-950 bg-violet-100 hover:bg-violet-200 dark:bg-violet-900 dark:hover:bg-violet-800"
            >
              <ArrowDownUp className="w-4 h-4" />
            </Button>
          </div>

          {/* To Token */}
          <div className="bg-gray-50 dark:bg-gray-800 rounded-xl p-4 space-y-3">
            <div className="flex justify-between items-center">
              <Label className="text-sm text-gray-500 dark:text-gray-400">
                To
              </Label>
              <span className="text-xs text-gray-500 dark:text-gray-400">
                {isBalancePending ? (
                  <Spinner />
                ) : (
                  `Balance: ${balanceData?.USDC} ${toToken}`
                )}
              </span>
            </div>
            <div className="flex gap-3">
              <Input
                type="number"
                placeholder="0.00"
                value={toAmount}
                readOnly
                className="text-2xl font-semibold border-0 bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0"
              />
              <Select value={toToken} onValueChange={setToToken}>
                <SelectTrigger className="w-[100px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="SOL">SOL</SelectItem>
                  <SelectItem value="USDC">USDC</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Exchange Rate Info */}
          {fromAmount && toAmount && (
            <Alert className="border-violet-200 bg-violet-50 dark:border-violet-800 dark:bg-violet-950/30">
              <Info className="h-4 w-4 text-violet-600 dark:text-violet-400" />
              <AlertDescription className="text-sm">
                <div className="space-y-2 mt-2">
                  <div className="flex justify-between">
                    <span className="text-gray-600 dark:text-gray-400">
                      Rate
                    </span>
                    <span className="font-semibold">
                      1 {fromToken} ≈{" "}
                      {fromToken === "SOL"
                        ? exchangeRate.toFixed(2)
                        : (1 / exchangeRate).toFixed(6)}{" "}
                      {toToken}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600 dark:text-gray-400">
                      Price Impact
                    </span>
                    <span
                      className={`font-semibold ${
                        priceImpact > 1 ? "text-amber-600" : "text-green-600"
                      }`}
                    >
                      {priceImpact.toFixed(2)}%
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600 dark:text-gray-400">
                      Network Fee
                    </span>
                    <span className="font-semibold">{estimatedFee} SOL</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600 dark:text-gray-400">
                      Min. Received
                    </span>
                    <span className="font-semibold">
                      {(toAmount * (1 - slippage / 100)).toFixed(6)} {toToken}
                    </span>
                  </div>
                </div>
              </AlertDescription>
            </Alert>
          )}

          {/* Swap Button */}
          <Button
            onClick={handleSwap}
            disabled={!fromAmount || !toAmount}
            className="w-full h-12 text-lg font-semibold bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-700 hover:to-purple-700 disabled:opacity-50"
          >
            {isSwapPending ? (
              <>
                <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                Swapping...
              </>
            ) : (
              `Swap ${fromToken} for ${toToken}`
            )}
          </Button>

          {isSwapSuccess && (
            <p className="text-green-500">Swap sent! Txid: {data?.txid}</p>
          )}
          {isSwapError && <p className="text-red-500">Swap failed</p>}

          {/* Info Footer */}
          <div className="pt-4 border-t space-y-2">
            <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
              <Info className="w-4 h-4" />
              <span>Powered by Jupiter Aggregator</span>
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              This is a demo interface. Connect your wallet to execute real
              swaps on Solana devnet.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
