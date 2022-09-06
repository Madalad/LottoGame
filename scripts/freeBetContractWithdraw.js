const { ethers } = require("hardhat")
const { networkConfig } = require("../helper-hardhat-config")

/**
 * Refunds all unsettled bets
 * Contract address is pulled from config files
 */
async function main() {
    const chainId = network.config.chainId
    const blockConfirmations = network.config.blockConfirmations || 1
    const freeBetContractAddress =
        networkConfig[chainId]["freeBetContractAddress"]
    const freeBetTokenAddress = networkConfig[chainId]["freeBetTokenAddress"]
    const mockUSDCAddress = networkConfig[network.config.chainId]["usdcAddress"]

    const FreeBetContractFactory = await ethers.getContractFactory(
        "FreeBetContract"
    )
    freeBetContract = FreeBetContractFactory.attach(freeBetContractAddress)
    const MockUSDCFactory = await ethers.getContractFactory("MockUSDC")
    mockUSDC = MockUSDCFactory.attach(mockUSDCAddress)
    const FreeBetTokenFactory = await ethers.getContractFactory("FreeBetToken")
    freeBetToken = FreeBetTokenFactory.attach(freeBetTokenAddress)

    console.log("FreeBetContract contract address:", freeBetContract.address)
    let usdcBalance = await mockUSDC.balanceOf(freeBetContractAddress)
    let fbtBalance = await freeBetToken.balanceOf(freeBetContractAddress)
    console.log("Contract balance USDC:", usdcBalance.toString())
    console.log("Contract balance FBT: ", fbtBalance.toString())

    if (usdcBalance == 0 && fbtBalance == 0) {
        console.log("No withdrawal required.")
    } else {
        console.log("Withdrawing...")
        if (usdcBalance != 0) {
            let txResponse = await freeBetContract.withdrawUsdc()
            await txResponse.wait(blockConfirmations)
            console.log("USDC withdrawn.")
        }
        if (fbtBalance != 0) {
            txResponse = await freeBetContract.withdrawFbt()
            await txResponse.wait(blockConfirmations)
            console.log("FBT withdrawn.")
        }
        console.log("Withdrawals complete.")
        usdcBalance = await mockUSDC.balanceOf(freeBetContractAddress)
        fbtBalance = await freeBetToken.balanceOf(freeBetContractAddress)
        console.log("Contract balance USDC:", usdcBalance.toString())
        console.log("Contract balance FBT :", fbtBalance.toString())
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error)
        process.exit(1)
    })
