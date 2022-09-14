const { assert } = require("chai")
const { ethers } = require("hardhat")
const {
    developmentChains,
    networkConfig,
} = require("../../helper-hardhat-config")
require("dotenv").config()

/**
 * Contract must be pre-deployed
 * Subscription must be set up and funded
 * Contract must be added as a consumer (see scripts/addConsumer.js)
 */
developmentChains.includes(network.name)
    ? describe.skip
    : describe("LottoGame staging tests", function () {
          const chainId = network.config.chainId
          let lottoGame, mockUSDC
          const lottoGameAddress = networkConfig[chainId]["lottoGameAddress"]
          const usdcAddress = networkConfig[chainId]["usdcAddress"]
          const betAmount = 5 * 10 ** 6 // $5
          const blockConfirmations = network.config.blockConfirmations
          const rake = 100

          beforeEach(async function () {
              const LottoGame = await ethers.getContractFactory("LottoGame")
              lottoGame = LottoGame.attach(lottoGameAddress)
              const MockUSDCFactory = await ethers.getContractFactory(
                  "MockUSDC"
              )
              mockUSDC = MockUSDCFactory.attach(usdcAddress)

              let txResponse = await lottoGame.setRake(0)
              await txResponse.wait(blockConfirmations)

              console.log("")
              console.log("LottoGame contract address:", lottoGame.address)
              console.log("MockUSDC contract address: ", mockUSDC.address)
              console.log("")
          })
          it("should accept bets, pick a winner, take a rake then payout", async function () {
              const { deployer, bettor, vault } = await ethers.getNamedSigners()

              const deployerStartBalance = await mockUSDC.balanceOf(
                  deployer.address
              )
              const bettorStartBalance = await mockUSDC.balanceOf(
                  bettor.address
              )
              const vaultStartBalance = await mockUSDC.balanceOf(vault.address)
              const contractStartBalance = await lottoGame.getBalance()
              console.log(
                  "Deployer start balance:",
                  deployerStartBalance.toString()
              )
              console.log(
                  "Bettor start balance:  ",
                  bettorStartBalance.toString()
              )
              console.log(
                  "Vault start balance:   ",
                  vaultStartBalance.toString()
              )
              console.log(
                  "Contract start balance:",
                  contractStartBalance.toString()
              )
              console.log("")

              console.log("Setting rake to 1%...")
              txResponse = await lottoGame.setRake(rake)
              await txResponse.wait(blockConfirmations)
              console.log("Rake set!")
              console.log("Rake:", (await lottoGame.getRake()).toString())
              console.log("")

              console.log("Bet amount =", betAmount.toString())
              console.log("Betting...")
              // place deployer bet
              txResponse = await mockUSDC.approve(lottoGame.address, betAmount)
              await txResponse.wait(blockConfirmations)
              await lottoGame.bet(betAmount)
              console.log("Deployer bet placed.")
              // place bettor bet
              let mockUSDCConnectedContract = await mockUSDC.connect(bettor)
              txResponse = await mockUSDCConnectedContract.approve(
                  lottoGame.address,
                  betAmount * 2
              )
              await txResponse.wait(blockConfirmations)
              const lottoGameConnectedContract = await lottoGame.connect(bettor)
              txResponse = await lottoGameConnectedContract.bet(betAmount)
              await txResponse.wait(blockConfirmations)
              console.log("Bettor bet placed.")
              console.log("All bets placed.")
              console.log("")

              // balances
              const countBettorsDuring = await lottoGame.getCountBettors()
              const deployerBalanceDuring = await mockUSDC.balanceOf(
                  deployer.address
              )
              const bettorBalanceDuring = await mockUSDC.balanceOf(
                  bettor.address
              )
              const contractBalanceDuring = await lottoGame.getBalance()
              console.log("count bettors:", countBettorsDuring.toString())
              console.log("deployer balance:", deployerBalanceDuring.toString())
              console.log("bettor balance:  ", bettorBalanceDuring.toString())
              console.log("contract balance:", contractBalanceDuring.toString())
              console.log("")

              // settle round
              await new Promise(async (resolve, reject) => {
                  await lottoGame.once("RoundSettled", async () => {
                      try {
                          console.log("Bet settled!")
                          console.log(
                              `Seconds to settle: ${
                                  (new Date().getTime() - now) / 1000
                              }`
                          )
                          console.log("")
                      } catch (e) {
                          reject(e)
                      }
                      resolve()
                  })
                  // setup
                  console.log("Requesting...")
                  txResponse = await lottoGame.requestRandomWords()
                  await txResponse.wait(blockConfirmations)
                  console.log("Request sent.")
                  console.log("")

                  const now = new Date().getTime()
                  console.log("Awaiting response...")
              })

              // get balances
              const contractEndBalance = await lottoGame.getBalance()
              const deployerEndBalance = await mockUSDC.balanceOf(
                  deployer.address
              )
              const bettorEndBalance = await mockUSDC.balanceOf(bettor.address)
              const vaultEndBalance = await mockUSDC.balanceOf(vault.address)
              console.log(
                  "Deployer end balance:",
                  deployerEndBalance.toString()
              )
              console.log("Bettor end balance:  ", bettorEndBalance.toString())
              console.log("Vault end balance:   ", vaultEndBalance.toString())
              console.log(
                  "Contract end balance:",
                  contractEndBalance.toString()
              )
              console.log("")
              // empty the vault
              const recentWinner = await lottoGame.getRecentWinner()
              const vaultAvax = await vault.getBalance()
              mockUSDCConnectedContract = await mockUSDC.connect(vault)
              await mockUSDCConnectedContract.transfer(
                  recentWinner,
                  vaultEndBalance.toNumber()
              )
              // assert
              assert.equal(contractEndBalance.toString(), "0")
              assert(
                  deployerStartBalance.toString() ==
                      deployerEndBalance.add(betAmount).toString() ||
                      deployerStartBalance.toString() ==
                          deployerEndBalance
                              .sub((betAmount * (10000 - rake * 2)) / 10000)
                              .toString()
              )
              console.log("Done!")
              console.log("--------------------")
          })
      })
