import 'dotenv/config'

import { type BigNumberish, ethers, utils, BigNumber } from 'ethers'
import fs from 'fs'
import { Command } from 'commander'
import fetch from 'node-fetch'

const TransferOnion = require('../out/TransferOnion.sol/TransferOnion.json')

interface LayerInput {
  recipient: string
  amount: BigNumberish
}

interface Layer {
  recipient: string
  amount: BigNumberish
  shell: string
}

const fetchSanctionedAddresses = async (url: string): Promise<string[]> =>
  (
    await fetch(url, {
      headers: {
        Authorization: `Bearer ${process.env['GITHUB_TOKEN']}`,
      },
    })
  ).json()

const parseLine = (line: string): LayerInput => {
  const items = line.split(',')
  return {
    recipient: items[0] as string,
    amount: utils.parseUnits(items[2] as string, 'ether'),
  }
}

const load = async (
  source: string,
  sanctionedUrl: string
): Promise<LayerInput[]> => {
  const outputs = []
  const sanctionedAddresses = await fetchSanctionedAddresses(sanctionedUrl)

  const file = fs.readFileSync(source).toString().trim().split('\n').slice(1)
  for (const line of file) {
    const output = parseLine(line)
    sanctionedAddresses.includes(output.recipient)
      ? // TODO Assumes address in sanctionedAddresses and output.recipient are checksummed
        console.log(`Removing sanctioned address: ${output.recipient}`)
      : outputs.push(output)
  }
  return outputs
}

const onionize = (
  inputs: LayerInput[]
): {
  onion: Layer[]
  shell: string
} => {
  let shell = ethers.constants.HashZero
  const onion: Layer[] = []
  for (const input of inputs) {
    onion.push({
      recipient: input.recipient,
      amount: input.amount,
      shell,
    })

    shell = ethers.utils.keccak256(
      ethers.utils.defaultAbiCoder.encode(
        ['address', 'uint256', 'bytes32'],
        [input.recipient, input.amount, shell]
      )
    )
  }

  return {
    onion: onion.reverse(),
    shell,
  }
}

const chunk = (arr: any[], size: number) => {
  const chunks: any[] = []
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size))
  }
  return chunks
}

const program = new Command()

program
  .name('onion')
  .description('tools for interacting with the token onion')
  .version('0.0.1')

program
  .command('wrap')
  .description('wrap the onion')
  .requiredOption('--source <source>', 'token onion source file')
  .requiredOption(
    '--sanctionedUrl <url>',
    'A URL that loads a JSON array of sanctioned addresses'
  )
  .action(async (args) => {
    // Load the inputs
    const inputs = await load(args.source, args.sanctionedUrl)
    const { shell } = onionize(inputs)

    // Print the shell
    process.stdout.write(shell)
  })

program
  .command('approval')
  .description('generate the approval amount')
  .requiredOption('--source <source>', 'token onion source file')
  .requiredOption(
    '--sanctionedUrl <url>',
    'A URL that loads a JSON array of sanctioned addresses'
  )
  .action(async (args) => {
    let total = BigNumber.from(0)
    const inputs = await load(args.source, args.sanctionedUrl)
    for (const input of inputs) {
      total = total.add(input.amount)
    }
    console.log(total.toString())
  })

program
  .command('validate')
  .description('validate balances')
  .requiredOption('--source <source>', 'token onion source file')
  .requiredOption(
    '--sanctionedUrl <url>',
    'A URL that loads a JSON array of sanctioned addresses'
  )
  .requiredOption('--token <token>', 'erc20 token address')
  .requiredOption('--provider <provider>', 'json rpc provider')
  .action(async (args) => {
    const inputs = await load(args.source, args.sanctionedUrl)
    const provider = new ethers.providers.StaticJsonRpcProvider(args.provider)

    const contract = new ethers.Contract(
      args.token,
      ['function balanceOf(address) view returns (uint256)'],
      provider
    )

    console.log(`Connecting to contract ${args.token}`)

    for (const input of inputs) {
      // @ts-ignore Property 'balanceOf' comes from an index signature, so it must be accessed with ['balanceOf'].
      const balance = await contract.balanceOf(input.recipient)
      if (balance.lt(input.amount)) {
        console.log(`balance: ${balance.toString()}`)
        console.log(`input amount: ${input.amount}`)
        throw new Error(`balance is off for ${input.recipient}`)
      }
    }
  })

program
  .command('peel')
  .description('peel the onion')
  .requiredOption('--source <source>', 'token onion source file')
  .requiredOption(
    '--sanctionedUrl <url>',
    'A URL that loads a JSON array of sanctioned addresses'
  )
  .requiredOption('--address <address>', 'token onion address')
  .requiredOption('--provider <provider>', 'json rpc provider')
  .requiredOption('--key <key>', 'ethereum private key to execute with')
  .action(async (args) => {
    // Load the contract
    const provider = new ethers.providers.StaticJsonRpcProvider(args.provider)
    const signer = new ethers.Wallet(args.key, provider)
    const contract = new ethers.Contract(
      args.address,
      TransferOnion.abi,
      signer
    )
    console.log(`Connecting to contract at ${args.address}`)

    // Load the inputs
    console.log('Loading inputs')
    const inputs = await load(args.source, args.sanctionedUrl)
    const { onion } = onionize(inputs)
    console.log('Built the onion')

    // Determine our start point
    // @ts-ignore Property 'shell' comes from an index signature, so it must be accessed with ['shell'].
    const current = await contract.shell()
    const start = onion.findIndex((l) => l.shell === current) + 1
    console.log(`Starting at ${current} - index ${start}`)

    // Chunk the onion/ TODO
    const chunks = chunk(onion.slice(start, onion.length), 350)
    // 1000 - 98000
    console.log(`Built ${chunks.length} chunks`)

    // Peel the onion
    let i = 0
    for (const c of chunks) {
      console.log(`Peeling ${i}`)
      //console.log(JSON.stringify(receipt, null, 2))
      // @ts-ignore Property 'peel' comes from an index signature, so it must be accessed with ['peel'].
      let tx = await contract.peel(c, { gasLimit: 14_000_000 })
      await tx.wait()
      console.log(tx.hash)
      i++
    }
  })

program.parse(process.argv)
