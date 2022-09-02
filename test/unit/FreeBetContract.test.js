const { assert, expect } = require("chai")
const { deployments, ethers, network } = require("hardhat")
const { developmentChains } = require("../../helper-hardhat-config")

!developmentChains.includes(network.name)
    ? describe.skip
    : describe("FreeBetContract", async function () {
          let deployer,
              bettor,
              lottoGame,
              freeBetContract,
              mockUSDC,
              freeBetToken,
              betAmount
          const maxInt = ethers.BigNumber.from(
              "0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff"
          )
          beforeEach(async function () {
              const accounts = await ethers.getSigners()
              deployer = accounts[0]
              bettor = accounts[1]
              betAmount = 5 * 10 ** 6 // $5
              // deploy contracts
              await deployments.fixture(["all"])
              lottoGame = await ethers.getContract(
                  "LottoGame",
                  deployer.address
              )
              freeBetContract = await ethers.getContract(
                  "FreeBetContract",
                  deployer.address
              )
              mockUSDC = await ethers.getContract("MockUSDC", deployer.address)
              freeBetToken = await ethers.getContract(
                  "FreeBetToken",
                  deployer.address
              )
              await lottoGame.setFreeBetContractAddress(freeBetContract.address)
              // fund free bet contract with usd and fbt
              mockUSDC.transfer(freeBetContract.address, 50 * 10 ** 6)
              freeBetToken.transfer(freeBetContract.address, 50 * 10 ** 6)
          })
          describe("bet", function () {
              it("should accept a free bet and emit the event", async function () {
                  const freeBetContractStartBalance =
                      await freeBetContract.getUsdcBalance()
                  const deployerStartBalance = await freeBetToken.balanceOf(
                      deployer.address
                  )
                  const freeBetContractFBTStartBalance =
                      await freeBetToken.balanceOf(freeBetContract.address)
                  // approve
                  await freeBetToken.approve(freeBetContract.address, betAmount)
                  // bet
                  await freeBetContract.bet(betAmount)
                  // assert
                  const bet = await lottoGame.getUnsettledBet(0)
                  const contractBalance = await lottoGame.getBalance()
                  const freeBetContractEndBalance =
                      await freeBetContract.getUsdcBalance()
                  const deployerEndBalance = await freeBetToken.balanceOf(
                      deployer.address
                  )
                  const freeBetContractFBTEndBalance =
                      await freeBetToken.balanceOf(freeBetContract.address)
                  assert.equal(contractBalance.toString(), betAmount.toString())
                  assert.equal(bet.bettor, deployer.address)
                  assert.equal(bet.betAmount.toString(), betAmount.toString())
                  assert.equal(
                      freeBetContractEndBalance.toString(),
                      freeBetContractStartBalance.sub(betAmount).toString()
                  )
                  assert.equal(
                      deployerEndBalance.toString(),
                      deployerStartBalance.sub(betAmount).toString()
                  )
                  assert.equal(
                      freeBetContractFBTEndBalance.toString(),
                      freeBetContractFBTStartBalance.add(betAmount).toString()
                  )
              })
              it("should revert if insufficient allowance", async function () {
                  const freeBetContractConnectedContract =
                      freeBetContract.connect(bettor)
                  await expect(
                      freeBetContractConnectedContract.bet(betAmount)
                  ).to.be.revertedWith("ERC20: insufficient allowance")
              })
              it("should revert if insufficient balance", async function () {
                  // approve
                  const freeBetTokenConnectedContract =
                      freeBetToken.connect(bettor)
                  await freeBetTokenConnectedContract.approve(
                      freeBetContract.address,
                      betAmount
                  )
                  const freeBetContractConnectedContract =
                      freeBetContract.connect(bettor)
                  // bet
                  await expect(
                      freeBetContractConnectedContract.bet(betAmount)
                  ).to.be.revertedWith("ERC20: transfer amount exceeds balance")
              })
              it("should revert if bet parameter is =0", async function () {
                  // approve
                  await freeBetToken.approve(freeBetContract.address, betAmount)
                  // bet
                  await expect(
                      freeBetContract.bet(0)
                  ).to.be.revertedWithCustomError(
                      freeBetContract,
                      "FreeBetContract__InsufficientBetAmount"
                  )
              })
              it("should settle properly if free bet wins", async function () {
                  // approve
                  await freeBetToken.approve(freeBetContract.address, betAmount)
                  const mockUSDCConnectedContract = mockUSDC.connect(bettor)
                  await mockUSDCConnectedContract.approve(
                      lottoGame.address,
                      betAmount
                  )
                  // free bet
                  await freeBetContract.bet(betAmount)
                  // regular bet
                  await mockUSDC.transfer(bettor.address, betAmount)
                  const lottoGameConnectedContract = lottoGame.connect(bettor)
                  await lottoGameConnectedContract.bet(betAmount)
                  const contractStartBalance = await lottoGame.getBalance()
                  const deployerStartBalance = await freeBetToken.balanceOf(
                      deployer.address
                  )
                  const bettorStartBalance = await mockUSDC.balanceOf(
                      bettor.address
                  )
                  // settle (free bet wins)
                  const placeholderRandomWord = 1
                  await lottoGame.settleRound(placeholderRandomWord)
                  // assert
                  const contractEndBalance = await lottoGame.getBalance()
                  const deployerEndBalance = await freeBetToken.balanceOf(
                      deployer.address
                  )
                  const bettorEndBalance = await mockUSDC.balanceOf(
                      bettor.address
                  )
                  assert.equal(
                      contractStartBalance.toString(),
                      (betAmount * 2).toString()
                  )
                  assert.equal(contractEndBalance.toString(), "0")
                  assert.equal(
                      deployerEndBalance.toString(),
                      deployerStartBalance.add(contractStartBalance).toString()
                  )
                  assert.equal(
                      bettorEndBalance.toString(),
                      bettorStartBalance.toString()
                  )
              })
          })
          describe("settle", function () {
              it("should not allow a user to call settle function", async function () {
                  await expect(
                      freeBetContract.settleRound(deployer.address, betAmount)
                  ).to.be.revertedWith(
                      "Only the LottoGame contract can call this function."
                  )
              })
          })
          describe("distribute", function () {
              it("should distribute FBT", async function () {
                  const fbtBalanceBefore = await freeBetToken.balanceOf(
                      bettor.address
                  )
                  // distribute
                  await freeBetContract.distributeFbt(bettor.address, betAmount)
                  // assert
                  const fbtBalanceAfter = await freeBetToken.balanceOf(
                      bettor.address
                  )
                  assert.equal(
                      fbtBalanceAfter.toString(),
                      fbtBalanceBefore.add(betAmount).toString()
                  )
              })
              it("should update bet requirements", async function () {
                  // distribute
                  await freeBetContract.distributeFbt(bettor.address, betAmount)
                  // assert
                  const betRequirementTotal =
                      await freeBetContract.betRequirementTotal(bettor.address)
                  const betRequirementProgress =
                      await freeBetContract.betRequirementProgress(
                          bettor.address
                      )
                  assert.equal(
                      betRequirementTotal.toString(),
                      (betAmount * 2).toString()
                  )
                  assert.equal(betRequirementProgress.toString(), "0")
              })
              it("should not update bet requirements if FBT balance != 0", async function () {
                  // distribute
                  await freeBetContract.distributeFbt(
                      bettor.address,
                      betAmount * 2
                  )
                  // approve
                  const freeBetTokenConnectedContract =
                      freeBetToken.connect(bettor)
                  await freeBetTokenConnectedContract.approve(
                      freeBetContract.address,
                      maxInt
                  )
                  // bet
                  const freeBetContractConnectedContract =
                      freeBetContract.connect(bettor)
                  await freeBetContractConnectedContract.bet(betAmount)
                  // distribute again
                  const betRequirementProgressBefore =
                      await freeBetContract.betRequirementProgress(
                          bettor.address
                      )
                  const betRequirementTotalBefore =
                      await freeBetContract.betRequirementTotal(bettor.address)
                  await freeBetContract.distributeFbt(bettor.address, betAmount)
                  const betRequirementProgressAfter =
                      await freeBetContract.betRequirementProgress(
                          bettor.address
                      )
                  const betRequirementTotalAfter =
                      await freeBetContract.betRequirementTotal(bettor.address)
                  assert.equal(
                      betRequirementProgressAfter.toString(),
                      betRequirementProgressBefore.toString()
                  )
                  assert.equal(
                      betRequirementTotalAfter.toString(),
                      betRequirementTotalBefore.toString()
                  )
                  const betRequirementCoefficient =
                      await freeBetContract.getBetRequirementCoefficient()
                  assert.notEqual(
                      betRequirementTotalAfter.toString(),
                      (betRequirementCoefficient * betAmount).toString()
                  )
                  assert.notEqual(betRequirementProgressAfter.toString(), "0")
              })
          })
          describe("redeem", function () {
              it("should revert if caller has insufficient fbt balance", async function () {
                  await expect(
                      freeBetContract.redeemFbt(1000000000)
                  ).to.be.revertedWith("Insufficient FBT balance.")
              })
              it("should revert if bet requirement progress is too low", async function () {
                  // distribute fbt
                  await freeBetContract.distributeFbt(bettor.address, betAmount)
                  // try to redeem
                  const freeBetContractConnectedContract =
                      freeBetContract.connect(bettor)
                  await expect(
                      freeBetContractConnectedContract.redeemFbt(betAmount)
                  ).to.be.revertedWith("You cannot redeem your FBT yet.")
              })
              it("collect fbt and release usdc", async function () {
                  // distribute fbt
                  await freeBetContract.distributeFbt(bettor.address, betAmount)
                  // place bets to achieve playthrough requirement
                  const betRequirementCoefficient =
                      await freeBetContract.getBetRequirementCoefficient()
                  const countBets = Math.ceil(betRequirementCoefficient)
                  const freeBetContractConnectedContract =
                      freeBetContract.connect(bettor)
                  const freeBetTokenConnectedContract =
                      freeBetToken.connect(bettor)
                  await freeBetTokenConnectedContract.approve(
                      freeBetContract.address,
                      maxInt // betAmount * countBets
                  )
                  for (i = 0; i < countBets; i++) {
                      await freeBetContractConnectedContract.bet(betAmount)
                      await lottoGame.settleRound(1)
                  }
                  // redeem
                  const bettorFbtBalanceBefore = await freeBetToken.balanceOf(
                      bettor.address
                  )
                  const bettorUsdBalanceBefore = await mockUSDC.balanceOf(
                      bettor.address
                  )
                  const contractFbtBalanceBefore = await freeBetToken.balanceOf(
                      freeBetContract.address
                  )
                  const contractUsdBalanceBefore = await mockUSDC.balanceOf(
                      freeBetContract.address
                  )
                  //await freeBetTokenConnectedContract.approve(freeBetContract.address, betAmount)
                  await freeBetContractConnectedContract.redeemFbt(betAmount)
                  const bettorFbtBalanceAfter = await freeBetToken.balanceOf(
                      bettor.address
                  )
                  const bettorUsdBalanceAfter = await mockUSDC.balanceOf(
                      bettor.address
                  )
                  const contractFbtBalanceAfter = await freeBetToken.balanceOf(
                      freeBetContract.address
                  )
                  const contractUsdBalanceAfter = await mockUSDC.balanceOf(
                      freeBetContract.address
                  )
                  // assert
                  assert.equal(
                      bettorUsdBalanceAfter.toString(),
                      bettorUsdBalanceBefore.add(betAmount).toString()
                  )
                  assert.equal(
                      bettorFbtBalanceAfter.toString(),
                      bettorFbtBalanceBefore.sub(betAmount).toString()
                  )
                  assert.equal(
                      contractUsdBalanceAfter.toString(),
                      contractUsdBalanceBefore.sub(betAmount)
                  )
                  assert.equal(
                      contractFbtBalanceAfter.toString(),
                      contractFbtBalanceBefore.add(betAmount)
                  )
              })
          })
          describe("refund", function () {
              it("should refund bets made with FBT", async function () {
                  // distribute fbt
                  await freeBetContract.distributeFbt(bettor.address, betAmount)
                  // approve fbt
                  const freeBetTokenConnectedContract =
                      freeBetToken.connect(bettor)
                  await freeBetTokenConnectedContract.approve(
                      freeBetContract.address,
                      betAmount
                  )
                  // place free bet
                  const freeBetContractConnectedContract =
                      freeBetContract.connect(bettor)
                  await freeBetContractConnectedContract.bet(betAmount)
                  // balances
                  const fbtBalanceBefore = await freeBetToken.balanceOf(
                      bettor.address
                  )
                  const usdBalanceBefore = await mockUSDC.balanceOf(
                      bettor.address
                  )
                  const contractFbtBalanceBefore = await freeBetToken.balanceOf(
                      freeBetContract.address
                  )
                  const contractUsdBalanceBefore = await mockUSDC.balanceOf(
                      lottoGame.address
                  )
                  // refund
                  await lottoGame.refundBets()
                  // assert
                  const fbtBalanceAfter = await freeBetToken.balanceOf(
                      bettor.address
                  )
                  const usdBalanceAfter = await mockUSDC.balanceOf(
                      bettor.address
                  )
                  const contractFbtBalanceAfter = await freeBetToken.balanceOf(
                      freeBetContract.address
                  )
                  const contractUsdBalanceAfter = await mockUSDC.balanceOf(
                      lottoGame.address
                  )
                  assert.equal(
                      fbtBalanceAfter.toString(),
                      fbtBalanceBefore.add(betAmount).toString()
                  )
                  assert.equal(
                      usdBalanceAfter.toString(),
                      usdBalanceBefore.toString()
                  )
                  assert.equal(
                      contractFbtBalanceAfter.toString(),
                      contractFbtBalanceBefore.sub(betAmount).toString()
                  )
                  assert.equal(
                      contractUsdBalanceAfter.toString(),
                      contractUsdBalanceBefore.sub(betAmount).toString()
                  )
              })
              it("should update bet requirement progress correctly", async function () {
                  // distribute fbt
                  await freeBetContract.distributeFbt(bettor.address, betAmount)
                  // approve fbt
                  const freeBetTokenConnectedContract =
                      freeBetToken.connect(bettor)
                  await freeBetTokenConnectedContract.approve(
                      freeBetContract.address,
                      betAmount
                  )
                  // place free bet
                  const freeBetContractConnectedContract =
                      freeBetContract.connect(bettor)
                  await freeBetContractConnectedContract.bet(betAmount)
                  // bet requirement progress
                  const betRequirementProgressBefore =
                      await freeBetContract.betRequirementProgress(
                          bettor.address
                      )
                  // refund
                  await lottoGame.refundBets()
                  // assert
                  const betRequirementProgressAfter =
                      await freeBetContract.betRequirementProgress(
                          bettor.address
                      )
                  assert.equal(
                      betRequirementProgressAfter.toString(),
                      betRequirementProgressBefore.sub(betAmount).toString()
                  )
              })
              it("should revert if a user is the caller", async function () {
                  await expect(
                      freeBetContract.refundFreeBet(deployer.address, betAmount)
                  ).to.be.revertedWith(
                      "Only the lottogame contract can call this function."
                  )
              })
          })
          describe("withdraw usdc", function () {
              it("should withdraw the usdc", async function () {
                  const contractStartBalance = await mockUSDC.balanceOf(
                      freeBetContract.address
                  )
                  await freeBetContract.withdrawUsdc()
                  const contractEndBalance = await mockUSDC.balanceOf(
                      freeBetContract.address
                  )
                  assert.equal(contractEndBalance.toString(), "0")
                  assert(contractStartBalance.gt(contractEndBalance))
              })
              it("should only allow the owner to withdraw", async function () {
                  const freeBetContractConnectedContract =
                      freeBetContract.connect(bettor)
                  await expect(
                      freeBetContractConnectedContract.withdrawUsdc()
                  ).to.be.revertedWith("Only the owner can call this function.")
              })
          })
          describe("withdraw fbt", function () {
              it("should withdraw fbt", async function () {
                  const contractFbtBalanceBefore = await freeBetToken.balanceOf(
                      freeBetContract.address
                  )
                  const deployerFbtBalanceBefore = await freeBetToken.balanceOf(
                      deployer.address
                  )
                  await freeBetContract.withdrawFbt()
                  const contractFbtBalanceAfter = await freeBetToken.balanceOf(
                      freeBetContract.address
                  )
                  const deployerFbtBalanceAfter = await freeBetToken.balanceOf(
                      deployer.address
                  )
                  assert.equal(contractFbtBalanceAfter.toString(), "0")
                  assert.equal(
                      deployerFbtBalanceAfter.toString(),
                      deployerFbtBalanceBefore
                          .add(contractFbtBalanceBefore)
                          .toString()
                  )
              })
              it("only the owner should be able to call", async function () {
                  const freeBetContractConnectedContract =
                      await freeBetContract.connect(bettor)
                  await expect(
                      freeBetContractConnectedContract.withdrawFbt()
                  ).to.be.revertedWith("Only the owner can call this function.")
              })
          })
          describe("setters", function () {
              it("should set betRequirementCoefficient", async function () {
                  const newBetRequirementCoefficient = 3
                  await freeBetContract.setBetRequirementCoefficient(
                      newBetRequirementCoefficient
                  )
                  const response =
                      await freeBetContract.getBetRequirementCoefficient()
                  assert.equal(
                      response.toString(),
                      newBetRequirementCoefficient.toString()
                  )
              })
          })
          describe("getters", function () {
              it("should get the usdc balance", async function () {
                  const balance = await freeBetContract.getUsdcBalance()
                  assert.equal(balance.toString(), "50000000")
              })
              it("should get the fbt balance", async function () {
                  const balance = await freeBetContract.getFbtBalance()
                  assert.equal(balance.toString(), "50000000")
              })
              it("should get the bet requirement coefficient", async function () {
                  const betRequirementCoefficient =
                      await freeBetContract.getBetRequirementCoefficient()
                  assert.equal(betRequirementCoefficient.toString(), "2") // 2 is the value defined in deploy script
              })
          })
      })
