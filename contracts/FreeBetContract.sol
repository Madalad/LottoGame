// SPDX-License-Identifier: MIT

pragma solidity ^0.8.7;

import "./LottoGame.sol";

error FreeBetContract__InsufficientBetAmount();

contract FreeBetContract {

    address private immutable i_owner;
    LottoGame private immutable i_lottoGame;
    ERC20 public immutable i_freeBetToken;
    ERC20 public mUSDC;
    uint256 private s_balance;
    uint256 public MAX_INT = 2 ** 256 - 1;

    constructor(
        address _lottoGameAddress,
        address _freeBetTokenAddress,
        address _mockUSDCAddress
        ) {
        i_owner = msg.sender;
        i_lottoGame = LottoGame(_lottoGameAddress);
        i_freeBetToken = ERC20(_freeBetTokenAddress);
        mUSDC = ERC20(_mockUSDCAddress);
        mUSDC.approve(_lottoGameAddress, MAX_INT);
    }
    
    modifier onlyOwner {
        require(msg.sender == i_owner, "Only the owner can call this function.");
        _;
    }

    function bet(uint256 _betAmount) public {
        if (_betAmount == 0) {revert FreeBetContract__InsufficientBetAmount();}
        i_freeBetToken.transferFrom(msg.sender, address(this), _betAmount);
        i_lottoGame.freeBet(_betAmount, msg.sender);
    }

    function getUSDCBalance() public view returns(uint256) {
        uint256 balance = mUSDC.balanceOf(address(this));
        return balance;
    }

    function withdraw() public onlyOwner {
        uint256 balance = mUSDC.balanceOf(address(this));
        mUSDC.transfer(msg.sender, balance);
    }
}