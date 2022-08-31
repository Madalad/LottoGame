// SPDX-License-Identifier: MIT

pragma solidity ^0.8.7;

import "./LottoGame.sol";

error FreeBetContract__InsufficientBetAmount();

contract FreeBetContract {

    address private immutable i_owner;
    LottoGame private lottoGame;
    ERC20 public FBT;
    ERC20 public mUSDC;
    uint256 public MAX_INT = 2 ** 256 - 1;

    /* Amount of $ value that must be staked with free bet token before swapping it for real usd */
    uint8 private constant betRequirementCoefficient = 2;

    mapping(address => uint256) public betRequirementTotal;
    mapping(address => uint256) public betRequirementProgress;

    constructor(
        address _lottoGameAddress,
        address _freeBetTokenAddress,
        address _mockUSDCAddress
        ) {
        i_owner = msg.sender;
        lottoGame = LottoGame(_lottoGameAddress);
        FBT = ERC20(_freeBetTokenAddress);
        mUSDC = ERC20(_mockUSDCAddress);
        mUSDC.approve(_lottoGameAddress, MAX_INT);
    }
    
    modifier onlyOwner {
        require(msg.sender == i_owner, "Only the owner can call this function.");
        _;
    }

    function bet(uint256 _betAmount) external {
        if (_betAmount == 0) {revert FreeBetContract__InsufficientBetAmount();}
        FBT.transferFrom(msg.sender, address(this), _betAmount);
        lottoGame.freeBet(_betAmount, msg.sender);
        betRequirementProgress[msg.sender] += _betAmount;
    }

    function settleRound(address _winner, uint256 _amountWon) external {
        require(msg.sender == address(lottoGame), "Only the LottoGame contract can call this function.");
        FBT.transfer(_winner, _amountWon);
    }

    function distributeFbt(address _recipient, uint256 _amount) external onlyOwner {
        if (FBT.balanceOf(_recipient) == 0) {
            betRequirementTotal[_recipient] = betRequirementCoefficient * _amount;
            betRequirementProgress[_recipient] = 0;
        }
        FBT.transfer(_recipient, _amount);
    }

    /**
     * @notice user must approve FBT spending by this contract before calling this function
    */
    function redeemFbt(uint256 _amount) external {
        require(FBT.balanceOf(msg.sender) >= _amount, "Insufficient FBT balance.");
        require(betRequirementProgress[msg.sender] >= betRequirementTotal[msg.sender], "You cannot redeem your FBT yet.");
        FBT.transferFrom(msg.sender, address(this), _amount);
        mUSDC.transfer(msg.sender, _amount);
        betRequirementProgress[msg.sender] = 0;
        betRequirementTotal[msg.sender] = 0;
    }

    function withdrawUsdc() external onlyOwner {
        uint256 balance = mUSDC.balanceOf(address(this));
        mUSDC.transfer(msg.sender, balance);
    }

    function withdrawFbt() external onlyOwner {
        uint256 balance = FBT.balanceOf(address(this));
        FBT.transfer(msg.sender, balance);
    }

    function getUsdcBalance() external view returns(uint256) {
        return mUSDC.balanceOf(address(this));
    }

    function getFbtBalance() external view returns(uint256) {
        return FBT.balanceOf(address(this));
    }
}