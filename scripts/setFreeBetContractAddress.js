const { ethers } = require("hardhat")
const { networkConfig } = require("../helper-hardhat-config")

async function main() {
    const chainId = network.config.chainId
    const lottoGameAddress = networkConfig[chainId]["lottoGameAddress"]
    const freeBetContractAddress =
        networkConfig[chainId]["freeBetContractAddress"]

    const LottoGameFactory = await ethers.getContractFactory("LottoGame")
    lottoGame = LottoGameFactory.attach(lottoGameAddress)
    console.log("LottoGame contract address:", lottoGame.address)

    const currentFreeBetContractAddress =
        await lottoGame.getFreeBetContractAddress()
    console.log(
        "Current free bet contract address:",
        currentFreeBetContractAddress
    )
    console.log("Updating...")
    const txResponse = await lottoGame.setFreeBetContractAddress(
        freeBetContractAddress
    )
    await txResponse.wait()
    console.log("Done!")
    console.log(
        "New FreeBetContract address:",
        (await lottoGame.getFreeBetContractAddress()).toString()
    )
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error)
        process.exit(1)
    })
