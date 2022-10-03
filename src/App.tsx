import "./App.css";
import { ethers } from "ethers";
import { useEffect, useState } from "react";
import {
  AztecSdk,
  createAztecSdk,
  EthersAdapter,
  EthereumProvider,
  SdkFlavour,
  AztecSdkUser,
  GrumpkinAddress,
  SchnorrSigner,
  EthAddress,
  TxSettlementTime,
} from "@aztec/sdk";

import { randomBytes } from "crypto";

import { depositEthToAztec, registerAccount, aztecConnect } from "./utils";
import { useBridgeData } from "./bridge-data";

declare var window: any;

const App = () => {
  const [hasMetamask, setHasMetamask] = useState(false);
  const [ethAccount, setEthAccount] = useState<EthAddress | null>(null);
  const [initing, setIniting] = useState(false);
  const [sdk, setSdk] = useState<null | AztecSdk>(null);
  const [account0, setAccount0] = useState<AztecSdkUser | null>(null);
  const [userExists, setUserExists] = useState<boolean>(false);
  const [accountPrivateKey, setAccountPrivateKey] = useState<Buffer | null>(
    null
  );
  const [accountPublicKey, setAccountPublicKey] =
    useState<GrumpkinAddress | null>(null);
  const [spendingSigner, setSpendingSigner] = useState<
    SchnorrSigner | undefined
  >(undefined);
  const [alias, setAlias] = useState("");
  const [amount, setAmount] = useState(0);

  const bridges = useBridgeData();
  useEffect(() => {
    if (bridges) console.log("Known bridges:", bridges);
    else console.log("Loading bridge data..");
  }, [bridges]);

  // Metamask Check
  useEffect(() => {
    if (window.ethereum) {
      setHasMetamask(true);
    }
    window.ethereum.on("accountsChanged", () => window.location.reload());
  }, []);

  async function connect() {
    if (window.ethereum) {
      // Get Metamask provider
      // TODO: Show error if Metamask is not on Aztec Testnet
      const provider = new ethers.providers.Web3Provider(window.ethereum);
      const ethereumProvider: EthereumProvider = new EthersAdapter(provider);

      // Get Metamask ethAccount
      await provider.send("eth_requestAccounts", []);
      const signer = provider.getSigner();
      const address = EthAddress.fromString(await signer.getAddress());
      setEthAccount(address);

      // Initialize SDK
      setIniting(true);
      const sdk = await createAztecSdk(ethereumProvider, {
        serverUrl: "https://api.aztec.network/aztec-connect-testnet/falafel", // Testnet
        pollInterval: 1000,
        memoryDb: true,
        debug: "bb:*",
        flavour: SdkFlavour.PLAIN,
        minConfirmation: 1, // ETH block confirmations
      });
      await sdk.run();
      console.log("Aztec SDK initialized:", sdk);
      setSdk(sdk);
      setIniting(false);

      // Generate user's account keypair
      const { publicKey, privateKey } = await sdk.generateAccountKeyPair(
        address
      );
      console.log("privacy key", privateKey);
      console.log("public key", publicKey.toString());
      setAccountPrivateKey(privateKey);
      setAccountPublicKey(publicKey);

      // Get or generate user's Aztec account
      let account0 = (await sdk.userExists(publicKey))
        ? await sdk.getUser(publicKey)
        : await sdk.addUser(privateKey);
      setAccount0(account0);
      if (await sdk.isAccountRegistered(publicKey)) setUserExists(true);
    }
  }

  async function logBalance() {
    // Wait for the SDK to read & decrypt notes to get the latest balances
    await account0!.awaitSynchronised();
    console.log(
      "zkETH balance",
      sdk!.fromBaseUnits(
        await sdk!.getBalance(account0!.id, sdk!.getAssetIdBySymbol("ETH"))
      )
    );
  }

  async function getSpendingKey() {
    const { privateKey } = await sdk!.generateSpendingKeyPair(ethAccount!);
    const signer = await sdk?.createSchnorrSigner(privateKey);
    console.log("signer added", signer);
    setSpendingSigner(signer);
  }

  async function registerNewAccount() {
    const depositTokenQuantity: bigint = ethers.utils
      .parseEther(amount.toString())
      .toBigInt();
    const recoverySigner = await sdk!.createSchnorrSigner(randomBytes(32));
    let recoverPublicKey = recoverySigner.getPublicKey();
    let txId = await registerAccount(
      accountPublicKey!,
      alias,
      accountPrivateKey!,
      spendingSigner!.getPublicKey(),
      recoverPublicKey,
      EthAddress.ZERO,
      depositTokenQuantity,
      TxSettlementTime.NEXT_ROLLUP,
      ethAccount!,
      sdk!
    );
    console.log("registration txId", txId);
    console.log(
      "lookup tx on explorer",
      `https://aztec-connect-testnet-explorer.aztec.network/tx/${txId.toString()}`
    );

    // TODO: Reject when deposit amount is <0.01ETH?
  }

  async function depositEth() {
    const depositTokenQuantity: bigint = ethers.utils
      .parseEther(amount.toString())
      .toBigInt();

    let txId = await depositEthToAztec(
      ethAccount!,
      accountPublicKey!,
      depositTokenQuantity,
      TxSettlementTime.NEXT_ROLLUP,
      sdk!
    );

    console.log("deposit txId", txId);
    console.log(
      "lookup tx on explorer",
      `https://aztec-connect-testnet-explorer.aztec.network/tx/${txId.toString()}`
    );

    // TODO: Catch error when depositing 0 ETH.
  }

  async function bridgeCrvLido() {
    const fromAmount: bigint = ethers.utils
      .parseEther(amount.toString())
      .toBigInt();
    // TODO: Catch error when fromAmount > user's available amount.

    if (account0 && spendingSigner && sdk) {
      let txId = await aztecConnect(
        account0,
        spendingSigner,
        6, // Testnet bridge id of CurveStEthBridge
        fromAmount,
        "ETH",
        "WSTETH",
        undefined,
        undefined,
        1e18, // Min acceptable amount of stETH per ETH
        TxSettlementTime.NEXT_ROLLUP,
        sdk
      );
      console.log("Bridge TXID: ", txId);
      console.log(
        "Lookup TX on Explorer: ",
        `https://aztec-connect-testnet-explorer.aztec.network/tx/${txId.toString()}`
      );
    }
  }

  return (
    <div className="App">
      {hasMetamask ? (
        sdk ? (
          <div>
            {userExists
              ? "Welcome back!"
              : // TODO: Greet user by alias.
              // TODO: Display available balance.
              ""}
            {spendingSigner && !userExists ? (
              <form>
                <label>
                  Alias:
                  <input
                    type="text"
                    value={alias}
                    onChange={(e) => setAlias(e.target.value)}
                  />
                </label>
              </form>
            ) : (
              ""
            )}
            {!spendingSigner && account0 ? (
              <button onClick={() => getSpendingKey()}>
                Generate Spending Key
              </button>
            ) : (
              ""
            )}
            {spendingSigner ? (
              <div>
                <form>
                  <label>
                    <input
                      type="number"
                      step="0.000000000000000001"
                      min="0.000000000000000001"
                      value={amount}
                      onChange={(e) => setAmount(e.target.valueAsNumber)}
                    />
                    ETH
                  </label>
                </form>
                {!userExists ? (
                  <button onClick={() => registerNewAccount()}>
                    Register Alias + Deposit ≥0.1 ETH
                  </button>
                ) : (
                  ""
                )}
              </div>
            ) : (
              ""
            )}
            {spendingSigner && account0 ? (
              <div>
                <button onClick={() => depositEth()}>Deposit ETH</button>
                <button onClick={() => bridgeCrvLido()}>
                  Swap ETH to wstETH
                </button>
              </div>
            ) : (
              ""
            )}
            {accountPrivateKey ? (
              <button onClick={() => logBalance()}>Log Balance</button>
            ) : (
              ""
            )}
            <button onClick={() => console.log("sdk", sdk)}>Log SDK</button>
          </div>
        ) : (
          <button onClick={() => connect()}>Connect Metamask</button>
        )
      ) : (
        // TODO: Fix rendering of this. Not rendered, reason unknown.
        "Metamask is not detected. Please make sure it is installed and enabled."
      )}
      {initing ? "Initializing Aztec SDK..." : ""}
    </div>
  );
};

export default App;
