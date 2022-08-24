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
              // fund free bet contract with usd
              mockUSDC.transfer(freeBetContract.address, 50 * 10 ** 6)
          })
          describe("bet", function () {
              it("should accept a free bet and emit the event", async function () {
                  const freeBetContractStartBalance =
                      await freeBetContract.getUSDCBalance()
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
                      await freeBetContract.getUSDCBalance()
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
                  const deployerStartBalance = await mockUSDC.balanceOf(
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
                  const deployerEndBalance = await mockUSDC.balanceOf(
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
          describe("withdraw", function () {
              it("should withdraw the usdc", async function () {
                  const contractStartBalance = await mockUSDC.balanceOf(
                      freeBetContract.address
                  )
                  await freeBetContract.withdraw()
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
                      freeBetContractConnectedContract.withdraw()
                  ).to.be.revertedWith("Only the owner can call this function.")
              })
          })
      })
