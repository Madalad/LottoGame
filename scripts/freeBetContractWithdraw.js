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
    //const freeBetTokenAddress = networkConfig[chainId]["freeBetTokenAddress"]
    const mockUSDCAddress = networkConfig[network.config.chainId]["usdcAddress"]

    const FreeBetContractFactory = await ethers.getContractFactory(
        "FreeBetContract"
    )
    freeBetContract = FreeBetContractFactory.attach(freeBetContractAddress)
    const MockUSDCFactory = await ethers.getContractFactory("MockUSDC")
    mockUSDC = MockUSDCFactory.attach(mockUSDCAddress)

    console.log("FreeBetContract contract address:", freeBetContract.address)
    let usdcBalance = await mockUSDC.balanceOf(freeBetContractAddress)
    console.log("Contract balance:", usdcBalance.toString(), "USD")

    console.log("Withdrawing...")
    const txResponse = await freeBetContract.withdrawUsdc()
    await txResponse.wait(blockConfirmations)
    console.log("Withdrawal complete.")

    usdcBalance = await mockUSDC.balanceOf(freeBetContractAddress)
    console.log("Contract balance:", usdcBalance.toString())
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error)
        process.exit(1)
    })
