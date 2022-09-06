const { ethers } = require("hardhat")
const { networkConfig } = require("../helper-hardhat-config")

async function main() {
    const chainId = network.config.chainId
    const freeBetContractAddress =
        networkConfig[chainId]["freeBetContractAddress"]

    const FreeBetContractFactory = await ethers.getContractFactory(
        "FreeBetContract"
    )
    freeBetContract = FreeBetContractFactory.attach(freeBetContractAddress)
    console.log("FreeBetContract contract address:", freeBetContract.address)
    const usdcBalance = await freeBetContract.getUsdcBalance()
    const fbtBalance = await freeBetContract.getFbtBalance()
    console.log("Contract USDC balance:", usdcBalance.toString())
    console.log("Contract FBT balance: ", fbtBalance.toString())

    const betRequirementCoefficient =
        await freeBetContract.getBetRequirementCoefficient()
    console.log(
        "Bet requirement coefficient:",
        betRequirementCoefficient.toString()
    )
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error)
        process.exit(1)
    })
