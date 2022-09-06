import {
  Metaplex,
  keypairIdentity,
  bundlrStorage,
} from '@metaplex-foundation/js';
import {Connection, clusterApiUrl, Keypair} from '@solana/web3.js';

async function main() {
  const connection = new Connection(clusterApiUrl('devnet'));
  const wallet = Keypair.generate();

  const metaplex = Metaplex.make(connection)
    .use(keypairIdentity(wallet))
    .use(bundlrStorage());
}

main().then(
  () => process.exit(),
  err => {
    console.error(err);
    throw Error(err);
  }
);
