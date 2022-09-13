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
          let lottoGame, freeBetContract
          let vrfCoordinatorV2Mock
          let mockUSDC, freeBetToken
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
              freeBetContract = await ethers.getContract(
                  "FreeBetContract",
                  deployer.address
              )
              await lottoGame.setFreeBetContractAddress(freeBetContract.address)
              freeBetToken = await ethers.getContract(
                  "FreeBetToken",
                  deployer.address
              )
              const deployerFbtBalance = await freeBetToken.balanceOf(
                  deployer.address
              )
              await freeBetToken.transfer(
                  freeBetContract.address,
                  deployerFbtBalance
              )
              const maxUint256 = ethers.BigNumber.from(
                  "0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff"
              )
              await mockUSDC.approve(freeBetContract.address, maxUint256)
              await freeBetContract.distributeFbt(deployer.address, betAmount)
              await freeBetToken.approve(freeBetContract.address, maxUint256)
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
                  await expect(
                      lottoGame.bet("0")
                  ).to.be.revertedWithCustomError(
                      lottoGame,
                      "LottoGame__InsufficientBetAmount"
                  )
              })
              it("should not accept a bet during VRF request", async function () {
                  await mockUSDC.approve(lottoGame.address, betAmount)
                  await lottoGame.bet(betAmount)
                  await lottoGame.requestRandomWords()
                  await expect(
                      lottoGame.bet(betAmount)
                  ).to.be.revertedWithCustomError(
                      lottoGame,
                      "LottoGame__BettingIsClosed"
                  )
              })
          })

          describe("freeBet", function () {
              it("should revert if called by anyone except FreeBetContract", async function () {
                  await expect(
                      lottoGame.freeBet(betAmount, deployer.address)
                  ).to.be.revertedWith("You cannot call this function.")
              })
              it("should revert if betting is closed", async function () {
                  await mockUSDC.approve(lottoGame.address, betAmount)
                  await lottoGame.bet(betAmount)
                  await lottoGame.requestRandomWords()
                  await expect(
                      freeBetContract.bet(betAmount)
                  ).to.be.revertedWithCustomError(
                      lottoGame,
                      "LottoGame__BettingIsClosed"
                  )
              })
              it("should revert if bet amount = 0", async function () {
                  await expect(
                      freeBetContract.bet("0")
                  ).to.be.revertedWithCustomError(
                      lottoGame,
                      "LottoGame__InsufficientBetAmount"
                  )
              })
              it("should update unsettledBets array", async function () {
                  const accounts = await ethers.getSigners()
                  const countBettors = 2
                  let bettor
                  let freeBetContractConnectedContract
                  for (i = 0; i < countBettors; i++) {
                      bettor = accounts[i]
                      // distribute FBT
                      await freeBetContract.distributeFbt(
                          bettor.address,
                          betAmount
                      )
                      // approve
                      mockUSDCConnectedContract = await mockUSDC.connect(bettor)
                      await mockUSDCConnectedContract.approve(
                          freeBetContract.address,
                          betAmount
                      )
                      freeBetTokenConnectedContract =
                          await freeBetToken.connect(bettor)
                      await freeBetTokenConnectedContract.approve(
                          freeBetContract.address,
                          betAmount
                      )
                      // transfer
                      //await mockUSDC.transfer(bettor.address, betAmount)
                      // bet
                      freeBetContractConnectedContract =
                          await freeBetContract.connect(bettor)
                      await freeBetContractConnectedContract.bet(betAmount)
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
              it("should refund a free bet properly", async function () {
                  // place free bet
                  await freeBetToken.approve(freeBetContract.address, betAmount)
                  await freeBetContract.bet(betAmount)
                  // refund
                  const deployerFbtBalanceBefore = await freeBetToken.balanceOf(
                      deployer.address
                  )
                  const freeBetContractUsdBalanceBefore =
                      await mockUSDC.balanceOf(freeBetContract.address)
                  await lottoGame.refundBets()
                  // assert
                  const deployerFbtBalanceAfter = await freeBetToken.balanceOf(
                      deployer.address
                  )
                  const freeBetContractUsdBalanceAfter =
                      await mockUSDC.balanceOf(freeBetContract.address)
                  assert.equal(
                      deployerFbtBalanceAfter.toString(),
                      deployerFbtBalanceBefore.add(betAmount).toString()
                  )
                  assert.equal(
                      freeBetContractUsdBalanceAfter.toString(),
                      freeBetContractUsdBalanceBefore.add(betAmount).toString()
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
              it("should update freeBetContractAddress", async function () {
                  await lottoGame.setFreeBetContractAddress(deployer.address)
                  const response = await lottoGame.getFreeBetContractAddress()
                  assert.equal(response, deployer.address)
              })
              it("should update rake", async function () {
                  const newRake = 100
                  await lottoGame.setRake(newRake)
                  const response = await lottoGame.getRake()
                  assert.equal(newRake.toString(), response.toString())
              })
              it("should revert if setting rake above 100%", async function () {
                  await expect(lottoGame.setRake(10001)).to.be.revertedWith(
                      "Cannot set rake to >10000 (100%)."
                  )
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
              it("should return allowance", async function () {
                  let allowance = await lottoGame.getAllowance()
                  assert.equal(allowance.toString(), "0")
                  await mockUSDC.approve(lottoGame.address, betAmount)
                  allowance = await lottoGame.getAllowance()
                  assert.equal(allowance.toString(), betAmount.toString())
              })
              it("should return freeBetContract address", async function () {
                  let freeBetContractAddress =
                      await lottoGame.getFreeBetContractAddress()
                  const zeroAddress = ethers.constants.AddressZero
                  assert(freeBetContractAddress, zeroAddress)
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
              it("should settle if a free bet wins", async function () {
                  // place free bet
                  await freeBetContract.bet(betAmount)
                  // settle
                  const deployerFbtBalanceBefore = await freeBetToken.balanceOf(
                      deployer.address
                  )
                  const freeBetContractUsdBalanceBefore =
                      await mockUSDC.balanceOf(freeBetContract.address)
                  await new Promise(async (resolve, reject) => {
                      lottoGame.once("RoundSettled", async () => {
                          try {
                              const deployerFbtBalanceAfter =
                                  await freeBetToken.balanceOf(deployer.address)
                              const freeBetContractUsdBalanceAfter =
                                  await mockUSDC.balanceOf(
                                      freeBetContract.address
                                  )
                              assert.equal(
                                  deployerFbtBalanceAfter.toString(),
                                  deployerFbtBalanceBefore
                                      .add(betAmount)
                                      .toString()
                              )
                              assert.equal(
                                  freeBetContractUsdBalanceAfter.toString(),
                                  freeBetContractUsdBalanceBefore
                                      .add(betAmount)
                                      .toString()
                              )
                          } catch (e) {
                              reject(e)
                          }
                          resolve()
                      })
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
          })
      })
