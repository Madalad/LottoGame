const { assert, expect } = require("chai")
const { deployments, ethers, network } = require("hardhat")
const {
    networkConfig,
    developmentChains,
} = require("../../helper-hardhat-config")

!developmentChains.includes(network.name)
    ? describe.skip
    : describe("LottoGame", async function () {
          let deployer
          let lottoGame
          let vrfCoordinatorV2Mock
          let mockUSDC
          const chainId = network.config.chainId
          let betAmount
          beforeEach(async function () {
              accounts = await ethers.getSigners()
              deployer = accounts[0]
              betAmount = 5 * 10 ** 6 // $5
              await deployments.fixture(["all"])
              lottoGame = await ethers.getContract(
                  "LottoGame",
                  deployer.address
              )
              vrfCoordinatorV2Mock = await ethers.getContract(
                  "VRFCoordinatorV2Mock",
                  deployer.address
              )
              mockUSDC = await ethers.getContract("MockUSDC", deployer.address)
          })

          describe("constructor", function () {
              it("should set state variables in the constructor", async function () {
                  const coordinatorAddress =
                      await lottoGame.getCoordinatorAddress()
                  const subscriptionId = await lottoGame.getSubscriptionId()
                  const keyHash = await lottoGame.getKeyHash()
                  const acceptingBets = await lottoGame.getAcceptingBets()
                  const vaultAddress = await lottoGame.getVaultAddress()
                  const rake = await lottoGame.getRake()
                  assert.equal(coordinatorAddress, vrfCoordinatorV2Mock.address)
                  assert.equal(
                      subscriptionId.toString(),
                      network.config.subscriptionId.toString()
                  )
                  assert.equal(keyHash, networkConfig[chainId]["vrfKeyHash"])
                  assert.equal(acceptingBets, true)
                  const accounts = await ethers.getSigners()
                  assert.equal(vaultAddress, accounts[2].address)
                  assert.equal(rake.toString(), "0")
              })
          })

          describe("bet", function () {
              it("should allow multiple users to bet", async function () {
                  const accounts = await ethers.getSigners()
                  const countBettors = 5

                  let bettor
                  let lottoGameConnectedContract
                  let mockUSDCConnectedContract
                  for (i = 0; i < countBettors; i++) {
                      bettor = accounts[i]
                      mockUSDCConnectedContract = await mockUSDC.connect(bettor)
                      await mockUSDCConnectedContract.approve(
                          lottoGame.address,
                          betAmount
                      )
                      await mockUSDC.transfer(bettor.address, betAmount)
                      lottoGameConnectedContract = await lottoGame.connect(
                          bettor
                      )
                      await lottoGameConnectedContract.bet(betAmount)
                  }

                  const lottoGameBalance = await lottoGame.getBalance()
                  assert.equal(lottoGameBalance, betAmount * countBettors)
              })
              it("should emit the appropriate event", async function () {
                  await mockUSDC.approve(lottoGame.address, betAmount)
                  const txResponse = await lottoGame.bet(betAmount)
                  const txReceipt = await txResponse.wait(1)
                  const { events } = txReceipt
                  const event = events[events.length - 1]["event"]
                  const args = events[events.length - 1]["args"]

                  assert.equal(event.toString(), "BetAccepted")
                  assert.equal(args["bettor"], deployer.address)
                  assert.equal(
                      args["betAmount"].toString(),
                      betAmount.toString()
                  )
              })
              it("should update unsettledBets array", async function () {
                  const accounts = await ethers.getSigners()
                  const countBettors = 5
                  let bettor
                  let lottoGameConnectedContract
                  for (i = 0; i < countBettors; i++) {
                      bettor = accounts[i]
                      // approve
                      mockUSDCConnectedContract = await mockUSDC.connect(bettor)
                      await mockUSDCConnectedContract.approve(
                          lottoGame.address,
                          betAmount
                      )
                      // transfer
                      await mockUSDC.transfer(bettor.address, betAmount)
                      lottoGameConnectedContract = await lottoGame.connect(
                          bettor
                      )
                      await lottoGameConnectedContract.bet(betAmount)
                  }

                  let currentBet
                  for (i = 0; i < countBettors; i++) {
                      currentBet = await lottoGame.getUnsettledBet(i)
                      assert.equal(
                          currentBet["betAmount"].toString(),
                          betAmount.toString()
                      )
                      assert.equal(currentBet["bettor"], accounts[i].address)
                  }
              })
              it("should revert bets of 0 USDC", async function () {
                  betAmount = 0
                  await expect(
                      lottoGame.bet(betAmount)
                  ).to.be.revertedWithCustomError(
                      lottoGame,
                      "LottoGame__InsufficientBetAmount"
                  )
              })
              it("should not accept a bet during VRF request", async function () {
                  await mockUSDC.approve(lottoGame.address, betAmount)
                  await lottoGame.bet(betAmount)
                  await lottoGame.requestRandomWords()
                  expect(
                      lottoGame.bet(betAmount)
                  ).to.be.revertedWithCustomError(
                      lottoGame,
                      "LottoGame__BettingIsClosed"
                  )
              })
          })

          describe("refund", function () {
              it("doesn't revert with no bets to refund", async function () {
                  let countBettors = await lottoGame.getCountBettors()
                  assert.equal(countBettors.toString(), "0")
                  await lottoGame.refundBets()
              })
              it("refunds two+ bets properly", async function () {
                  accounts = await ethers.getSigners()
                  bettor = accounts[1]

                  // deployer bet
                  await mockUSDC.approve(lottoGame.address, betAmount)
                  await lottoGame.bet(betAmount)
                  // bettor bet
                  mockUSDC.transfer(bettor.address, betAmount)
                  const mockUSDCConnectedContract = await mockUSDC.connect(
                      bettor
                  )
                  await mockUSDCConnectedContract.approve(
                      lottoGame.address,
                      betAmount
                  )
                  const lottoGameConnectedContract = await lottoGame.connect(
                      bettor
                  )
                  await lottoGameConnectedContract.bet(betAmount)

                  const deployerStartBalance = await mockUSDC.balanceOf(
                      deployer.address
                  )
                  const bettorStartBalance = await mockUSDC.balanceOf(
                      bettor.address
                  )
                  const contractStartBalance = await lottoGame.getBalance()
                  await lottoGame.refundBets()
                  const deployerEndBalance = await mockUSDC.balanceOf(
                      deployer.address
                  )
                  const bettorEndBalance = await mockUSDC.balanceOf(
                      bettor.address
                  )
                  const contractEndBalance = await lottoGame.getBalance()
                  const countBettors = await lottoGame.getCountBettors()

                  assert.equal(contractStartBalance, betAmount * 2)
                  assert.equal(contractEndBalance, 0)
                  assert.equal(
                      deployerEndBalance.toString(),
                      deployerStartBalance.add(betAmount).toString()
                  )
                  assert.equal(
                      bettorEndBalance.toString(),
                      bettorStartBalance.add(betAmount).toString()
                  )
                  assert.equal(countBettors.toString(), "0")
              })
              it("emits the appropriate event", async function () {
                  // deployer bet
                  await mockUSDC.approve(lottoGame.address, betAmount)
                  await lottoGame.bet(betAmount)
                  const txResponse = await lottoGame.refundBets()
                  const txReceipt = await txResponse.wait(1)
                  assert.equal(txReceipt.events[1].event, "BetsRefunded")
                  assert.equal(
                      txReceipt.events[1].args.countParticipants.toString(),
                      "1"
                  )
                  assert.equal(
                      txReceipt.events[1].args.totalRefunded.toString(),
                      betAmount.toString()
                  )
              })
          })

          describe("setters", function () {
              it("should update vaultAddress", async function () {
                  const newVaultAddress = accounts[3].address
                  await lottoGame.setVaultAddress(newVaultAddress)
                  const response = await lottoGame.getVaultAddress()
                  assert.equal(response, newVaultAddress)
              })
          })

          describe("getters", function () {
              it("should get the recent winner", async function () {
                  await mockUSDC.approve(lottoGame.address, betAmount)
                  await lottoGame.bet(betAmount)
                  await new Promise(async (resolve, reject) => {
                      lottoGame.once("RoundSettled", async () => {
                          try {
                              // assert
                              const recentWinner =
                                  await lottoGame.getRecentWinner()
                              assert.equal(recentWinner, deployer.address)
                          } catch (e) {
                              reject(e)
                          }
                          resolve()
                      })
                      const txResponse = await lottoGame.requestRandomWords()
                      const txReceipt = await txResponse.wait(1)
                      await vrfCoordinatorV2Mock.fulfillRandomWords(
                          txReceipt.events[1].args.requestId,
                          lottoGame.address
                      )
                  })
              })
              it("should return unsettled bets", async function () {
                  await mockUSDC.approve(lottoGame.address, betAmount)
                  await lottoGame.bet(betAmount)
                  const bet = await lottoGame.getUnsettledBet(0)
                  assert.equal(
                      bet.bettor.toString(),
                      deployer.address.toString()
                  )
                  assert.equal(bet.betAmount.toString(), betAmount.toString())
              })
          })

          describe("settle round", function () {
              it("should settle bets", async function () {
                  // place bets
                  for (i = 10; i < 15; i++) {
                      await mockUSDC.transfer(accounts[i].address, betAmount)
                      mockUSDCConnectedContract = await mockUSDC.connect(
                          accounts[i]
                      )
                      await mockUSDCConnectedContract.approve(
                          lottoGame.address,
                          betAmount
                      )
                      lottoGameConnectedContract = lottoGame.connect(
                          accounts[i]
                      )
                      await lottoGameConnectedContract.bet(betAmount)
                  }
                  // settle
                  await new Promise(async (resolve, reject) => {
                      lottoGame.once("RoundSettled", async () => {
                          try {
                              // assert
                              const acceptingBets =
                                  await lottoGame.getAcceptingBets()
                              const countBettors =
                                  await lottoGame.getCountBettors()
                              const recentWinner =
                                  await lottoGame.getRecentWinner()
                              const winnerEndBalance = await mockUSDC.balanceOf(
                                  winner
                              )
                              const contractEndBalance =
                                  await mockUSDC.balanceOf(lottoGame.address)
                              assert.equal(acceptingBets, true)
                              assert.equal(countBettors.toString(), "0")
                              assert.equal(recentWinner, winner)
                              assert.equal(
                                  winnerEndBalance.toString(),
                                  (
                                      winnerStartBalance.toNumber() +
                                      betAmount * 5
                                  ).toString()
                              )
                              assert.equal(contractEndBalance.toString(), "0")
                          } catch (e) {
                              reject(e)
                          }
                          resolve()
                      })
                      const winner = accounts[12].address
                      const txResponse = await lottoGame.requestRandomWords()
                      const txReceipt = await txResponse.wait(1)
                      const winnerStartBalance = await mockUSDC.balanceOf(
                          winner
                      )
                      await vrfCoordinatorV2Mock.fulfillRandomWords(
                          txReceipt.events[1].args.requestId,
                          lottoGame.address
                      )
                  })
              })
              it("should work with rake", async function () {
                  // set rake
                  await lottoGame.setRake(100) // 1%
                  // place bets
                  for (i = 10; i < 15; i++) {
                      await mockUSDC.transfer(accounts[i].address, betAmount)
                      mockUSDCConnectedContract = await mockUSDC.connect(
                          accounts[i]
                      )
                      await mockUSDCConnectedContract.approve(
                          lottoGame.address,
                          betAmount
                      )
                      lottoGameConnectedContract = lottoGame.connect(
                          accounts[i]
                      )
                      await lottoGameConnectedContract.bet(betAmount)
                  }
                  // settle
                  await new Promise(async (resolve, reject) => {
                      lottoGame.once("RoundSettled", async () => {
                          try {
                              // assert
                              const acceptingBets =
                                  await lottoGame.getAcceptingBets()
                              const countBettors =
                                  await lottoGame.getCountBettors()
                              const recentWinner =
                                  await lottoGame.getRecentWinner()
                              const winnerEndBalance = await mockUSDC.balanceOf(
                                  winner
                              )
                              const contractEndBalance =
                                  await mockUSDC.balanceOf(lottoGame.address)
                              const vaultAddress =
                                  await lottoGame.getVaultAddress()
                              const vaultEndBalance = await mockUSDC.balanceOf(
                                  vaultAddress
                              )
                              assert.equal(acceptingBets, true)
                              assert.equal(countBettors.toString(), "0")
                              assert.equal(recentWinner, winner)
                              assert.equal(
                                  winnerEndBalance.toString(),
                                  (
                                      winnerStartBalance.toNumber() +
                                      betAmount * 5 * 0.99
                                  ).toString()
                              )
                              assert.equal(contractEndBalance.toString(), "0")
                              assert.equal(
                                  vaultEndBalance.toString(),
                                  (betAmount * 5 * 0.01).toString()
                              )
                          } catch (e) {
                              reject(e)
                          }
                          resolve()
                      })
                      const winner = accounts[12].address
                      const txResponse = await lottoGame.requestRandomWords()
                      const txReceipt = await txResponse.wait(1)
                      const winnerStartBalance = await mockUSDC.balanceOf(
                          winner
                      )
                      await vrfCoordinatorV2Mock.fulfillRandomWords(
                          txReceipt.events[1].args.requestId,
                          lottoGame.address
                      )
                  })
              })
              it("should emit event with correct information", async function () {
                  await mockUSDC.approve(lottoGame.address, betAmount)
                  await lottoGame.bet(betAmount)
                  await new Promise(async (resolve, reject) => {
                      lottoGame.once(
                          "RoundSettled",
                          async (
                              blockTimestamp,
                              blockNumber,
                              potAmount,
                              winner,
                              winningBet,
                              countBettors
                          ) => {
                              try {
                                  assert(
                                      potAmount.toString() ==
                                          betAmount.toString()
                                  )
                                  assert(
                                      winner.toString() ==
                                          deployer.address.toString()
                                  )
                                  assert(
                                      winningBet.toString() ==
                                          betAmount.toString()
                                  )
                                  assert(countBettors.toString() == "1")
                              } catch (e) {
                                  reject(e)
                              }
                              resolve()
                          }
                      )
                      txResponse = await lottoGame.requestRandomWords()
                      txReceipt = await txResponse.wait(1)
                      txResponse =
                          await vrfCoordinatorV2Mock.fulfillRandomWords(
                              txReceipt.events[1].args.requestId,
                              lottoGame.address
                          )
                      await txResponse.wait(1)
                  })
              })
              it("should revert if there are 0 bettors", async function () {
                  await expect(
                      lottoGame.requestRandomWords()
                  ).to.be.revertedWithCustomError(
                      lottoGame,
                      "LottoGame__NoBetsToSettle"
                  )
              })
          })
      })
