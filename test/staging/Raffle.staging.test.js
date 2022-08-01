const { assert } = require("chai")
const { ethers } = require("hardhat")
const {
    developmentChains,
    networkConfig,
} = require("../../helper-hardhat-config")
require("dotenv").config()

developmentChains.includes(network.name)
    ? describe.skip
    : describe("Raffle staging tests", async function () {
          const chainId = network.config.chainId
          let deployer
          let bettor
          let raffle
          // contract must be pre-deployed and subscription must be set and funded manually
          const raffleAddress = network.config.raffleAddress
          let mockUSDC
          const usdcAddress = networkConfig[chainId]["usdcAddress"]
          const betAmount = 5 * 10 ** 6 // $5

          beforeEach(async function () {
              const accounts = await ethers.getSigners()
              deployer = accounts[0]
              bettor = accounts[1]

              const RaffleFactory = await ethers.getContractFactory("Raffle")
              raffle = RaffleFactory.attach(raffleAddress)
              const MockUSDCFactory = await ethers.getContractFactory(
                  "MockUSDC"
              )
              mockUSDC = MockUSDCFactory.attach(usdcAddress)

              await raffle.setRake(0)

              console.log("")
              console.log("Raffle contract address:", raffle.address)
              console.log("mUSDC address:          ", mockUSDC.address)
              console.log("")
          })
          it("should accept bets and decide a winner", async function () {
              const deployerStartBalance = await mockUSDC.balanceOf(
                  deployer.address
              )
              const bettorStartBalance = await mockUSDC.balanceOf(
                  bettor.address
              )
              const contractStartBalance = await raffle.getBalance()
              console.log(
                  "Deployer start balance:",
                  deployerStartBalance.toString()
              )
              console.log(
                  "Bettor start balance:  ",
                  bettorStartBalance.toString()
              )
              console.log(
                  "Contract start balance:",
                  contractStartBalance.toString()
              )
              console.log("")

              console.log("betAmount =", betAmount.toString())
              console.log("Betting...")
              let txResponse
              // place deployer bet
              txResponse = await mockUSDC.approve(raffle.address, betAmount)
              await txResponse.wait(2)
              await raffle.bet(betAmount)
              console.log("Deployer bet placed.")
              // place bettor bet
              const mockUSDCConnectedContract = await mockUSDC.connect(bettor)
              txResponse = await mockUSDCConnectedContract.approve(
                  raffle.address,
                  betAmount * 2
              )
              await txResponse.wait(2)
              const raffleConnectedContract = await raffle.connect(bettor)
              txResponse = await raffleConnectedContract.bet(betAmount)
              await txResponse.wait(2)
              console.log("Bettor bet placed.")
              console.log("All bets placed.")
              console.log("")

              const countBettorsDuring = await raffle.getCountBettors()
              const deployerBalanceDuring = await mockUSDC.balanceOf(
                  deployer.address
              )
              const bettorBalanceDuring = await mockUSDC.balanceOf(
                  bettor.address
              )
              const contractBalanceDuring = await raffle.getBalance()

              console.log("count bettors:", countBettorsDuring.toString())
              console.log("deployer balance:", deployerBalanceDuring.toString())
              console.log("bettor balance:", bettorBalanceDuring.toString())
              console.log("contract balance:", contractBalanceDuring.toString())
              console.log("")

              // request random number
              console.log("Requesting...")
              txResponse = await raffle.requestRandomWords()
              await txResponse.wait(2)
              console.log("Random words request sent.")
              console.log("")

              // wait for response
              const now = new Date().getTime()
              console.log("Awaiting response...")
              let countBettors = await raffle.getCountBettors()
              while (countBettors > 0) {
                  countBettors = await raffle.getCountBettors()
              }
              console.log("Bet settled!")
              console.log(
                  `Seconds to settle: ${(new Date().getTime() - now) / 1000}`
              )
              console.log("")

              // assert
              const contractEndBalance = await raffle.getBalance()
              const deployerEndBalance = await mockUSDC.balanceOf(
                  deployer.address
              )
              const bettorEndBalance = await mockUSDC.balanceOf(bettor.address)
              console.log(
                  "Deployer end balance:",
                  deployerEndBalance.toString()
              )
              console.log("Bettor end balance:  ", bettorEndBalance.toString())
              console.log(
                  "Contract end balance:",
                  contractEndBalance.toString()
              )

              assert.equal(contractEndBalance.toString(), "0")
              assert(
                  deployerStartBalance.toString() ==
                      deployerEndBalance.add(betAmount).toString() ||
                      deployerStartBalance.toString() ==
                          deployerEndBalance.sub(betAmount).toString()
              )
              console.log("Done!")

              console.log("")
              console.log("--------------------")

              console.log("")
              console.log("Checking rake:")
              console.log("Setting rake to 1%...")
              const rake = 100
              txResponse = await raffle.setRake(100)
              await txResponse.wait(1)
              console.log("Rake set!")
              console.log("Rake:", (await raffle.getRake()).toString())
              console.log("")

              const vaultAddress = process.env.VAULT_ADDRESS
              const vaultStartBalance = await mockUSDC.balanceOf(vaultAddress)
              console.log(
                  "Vault starting balance:",
                  vaultStartBalance.toString()
              )
              console.log("")

              console.log("Betting...")
              txResponse = await mockUSDC.approve(raffle.address, betAmount)
              await txResponse.wait(1)
              txResponse = await raffle.bet(betAmount)
              await txResponse.wait(1)
              console.log("Bet placed.")
              console.log("")

              // request random number
              console.log("Requesting...")
              txResponse = await raffle.requestRandomWords()
              await txResponse.wait(1)
              console.log("Random words request sent.")
              console.log("")

              // wait for response
              console.log("Awaiting response...")
              countBettors = await raffle.getCountBettors()
              while (countBettors > 0) {
                  countBettors = await raffle.getCountBettors()
              }
              console.log("Bet settled!")
              console.log("")
              await raffle.setRake(0)

              const deployerFinalBalance = await mockUSDC.balanceOf(
                  deployer.address
              )
              const contractFinalBalance = await raffle.getBalance()
              const vaultFinalBalance = await mockUSDC.balanceOf(vaultAddress)
              console.log(
                  "Deployer final balance:",
                  deployerFinalBalance.toString()
              )
              console.log(
                  "Contract final balance:",
                  contractFinalBalance.toString()
              )
              console.log("Vault balance:", vaultFinalBalance.toString())
              console.log("")

              assert.equal(contractFinalBalance.toString(), "0")
              assert.equal(
                  deployerFinalBalance.toString(),
                  deployerEndBalance.sub((betAmount * rake) / 10000).toString()
              )
              assert.equal(
                  vaultFinalBalance.toString(),
                  //(0.01 * betAmount).toString()
                  vaultStartBalance.add(0.01 * betAmount).toString()
              )
              console.log("Done!")
              console.log("")
          })
      })
