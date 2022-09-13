const { assert } = require("chai")
const { ethers, network } = require("hardhat")
const { developmentChains } = require("../../helper-hardhat-config")

!developmentChains.includes(network.name)
    ? describe.skip
    : describe("FreeBetToken", function () {
          let freeBetToken
          beforeEach(async function () {
              const accounts = await ethers.getSigners()
              deployer = accounts[0]
              await deployments.fixture(["all"])
              freeBetToken = await ethers.getContract(
                  "FreeBetToken",
                  deployer.address
              )
          })
          it("should mint $100 to deployer initially", async function () {
              const deployerBalance = await freeBetToken.balanceOf(
                  deployer.address
              )
              assert.equal(
                  deployerBalance.toString(),
                  (100 * 10 ** 6).toString()
              )
          })
          it("has 6 decimals", async function () {
              const decimals = await freeBetToken.decimals()
              assert.equal(decimals.toString(), "6")
          })
          it("should mint new tokens", async function () {
              const balanceBefore = await freeBetToken.balanceOf(
                  deployer.address
              )
              await freeBetToken.mint(deployer.address, 10 ** 6)
              const balanceAfter = await freeBetToken.balanceOf(
                  deployer.address
              )
              assert.equal(
                  balanceAfter.toString(),
                  balanceBefore.add(10 ** 6).toString()
              )
          })
          it("should burn tokens", async function () {
              const balanceBefore = await freeBetToken.balanceOf(
                  deployer.address
              )
              await freeBetToken.burn(deployer.address, 10 ** 6)
              const balanceAfter = await freeBetToken.balanceOf(
                  deployer.address
              )
              assert.equal(
                  balanceAfter.toString(),
                  balanceBefore.sub(10 ** 6).toString()
              )
          })
      })
