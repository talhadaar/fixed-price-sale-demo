import {
  Metaplex,
  keypairIdentity,
  bundlrStorage,
  findMasterEditionV2Pda,
} from '@metaplex-foundation/js';
import {
  Connection,
  clusterApiUrl,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
  Transaction,
  sendAndConfirmTransaction,
} from '@solana/web3.js';
import {readFileSync} from 'fs';
import {parse} from 'yaml';
import * as fixedPriceSale from '@metaplex-foundation/mpl-fixed-price-sale';
import * as splToken from '@solana/spl-token';
import * as tokenMetadata from '@metaplex-foundation/mpl-token-metadata';
import {BN} from 'bn.js';

export const createTokenAccount = async (
  payer: Keypair,
  mint: PublicKey,
  connection: Connection,
  account: Keypair,
  owner?: PublicKey
) => {
  const createTokenTx = new Transaction();

  const accountRentExempt = await connection.getMinimumBalanceForRentExemption(
    splToken.AccountLayout.span
  );

  createTokenTx.add(
    SystemProgram.createAccount({
      fromPubkey: payer.publicKey,
      newAccountPubkey: account.publicKey,
      lamports: accountRentExempt,
      space: splToken.AccountLayout.span,
      programId: new PublicKey(splToken.TOKEN_PROGRAM_ID),
    })
  );

  createTokenTx.add(
    splToken.Token.createInitAccountInstruction(
      splToken.TOKEN_PROGRAM_ID,
      mint,
      account.publicKey,
      owner ?? payer.publicKey
    )
  );

  createTokenTx.recentBlockhash = (
    await connection.getLatestBlockhash()
  ).blockhash;
  createTokenTx.feePayer = payer.publicKey;
  createTokenTx.partialSign(account);

  return await sendAndConfirmTransaction(connection, createTokenTx, [
    payer,
    account,
  ]);
};

interface AttributeInfo {
  trait_type: string;
  value: number;
}
interface FileInfo {
  uri: string;
  type: string;
}
interface NFTMetadata {
  name: string;
  symbol: string;
  description: string;
  image: string;
  attributes: AttributeInfo[];
  properties: {
    files: FileInfo[];
  };
}

async function main() {
  // const {payer, connection, transactionHandler} = await createPrerequisites();

  const nftsToUpload = 3;
  const nftsMinted = [];

  const connection = new Connection(clusterApiUrl('devnet'));
  const wallet = Keypair.generate();

  const metaplex = Metaplex.make(connection)
    .use(keypairIdentity(wallet))
    .use(bundlrStorage());

  // airdrop sol to wallet
  const sig = await connection.requestAirdrop(
    wallet.publicKey,
    LAMPORTS_PER_SOL * 2
  );
  await connection.confirmTransaction(sig, 'finalized');

  console.log(`Wallet address(Secret Key): ${wallet.secretKey}`);
  console.log(`Wallet address(Public Key): ${wallet.publicKey}`);

  // read and parse metadata, then create NFTs
  for (let i = 0; i < nftsToUpload; i++) {
    const name = './assets/' + i.toString() + '.json';
    const rawMetadata: Buffer = readFileSync(name);
    const parsedMetadata: NFTMetadata = parse(rawMetadata.toString());

    const sig = await metaplex
      .nfts()
      .create({
        payer: wallet,
        uri: parsedMetadata.properties.files[0].uri,
        name: parsedMetadata.name,
        sellerFeeBasisPoints: 500,
      })
      .run();
    console.log(
      ` ${parsedMetadata.name} minted with signature ${sig.response.signature}`
    );
    nftsMinted.push(sig);
  }

  // const adminKey = Keypair.generate();
  // await connection.confirmTransaction(
  //   await connection.requestAirdrop(adminKey.publicKey, LAMPORTS_PER_SOL * 2),
  //   'finalized'
  // );
  const store = Keypair.generate().publicKey;
  const storeName = 'Bau Jee di bhatti';
  const storeDescription = 'sastay may phastay saaray hastay hastay ::(';

  const sellingResource = nftsMinted[0];
  const tx = new Transaction();
  /// flollowing flow at https://docs.metaplex.com/programs/fixed-price-sale/tech-description
  const createStoreIx = fixedPriceSale.createCreateStoreInstruction(
    {
      admin: wallet.publicKey,
      store,
    },
    {
      name: storeName,
      description: storeDescription,
    }
  );
  tx.add(createStoreIx);
  /// Create Vault owner token
  const [vaultOwner, vaultOwnerBump] =
    await fixedPriceSale.findVaultOwnerAddress(
      sellingResource.mintAddress,
      store
    );

  const vault = Keypair.generate();
  const createTokenTxSig = await createTokenAccount(
    wallet,
    sellingResource.mintAddress,
    connection,
    vault,
    vaultOwner
  );

  const sellingResourceAccount = Keypair.generate();
  const masterEditionPda = findMasterEditionV2Pda(
    sellingResource.mintAddress,
    new PublicKey(tokenMetadata.PROGRAM_ADDRESS)
  );

  const initSellingResourceIx =
    fixedPriceSale.createInitSellingResourceInstruction(
      {
        store,
        admin: wallet.publicKey,
        sellingResource: sellingResourceAccount.publicKey,
        sellingResourceOwner: wallet.publicKey,
        resourceMint: sellingResource.mintAddress,
        masterEdition: sellingResource.masterEditionAddress,
        metadata: sellingResource.metadataAddress,
        vault: vault.publicKey,
        owner: vaultOwner,
        resourceToken: sellingResource.tokenAddress,
      },
      {
        masterEditionBump: masterEditionPda.bump,
        vaultOwnerBump,
        maxSupply: new BN(1),
      }
    );
  tx.add(initSellingResourceIx);
  await sendAndConfirmTransaction(connection, tx, [wallet]);
}

main().then(
  () => {
    process.exit(1);
  },
  err => {
    console.error(err);
    throw Error(err);
  }
);
