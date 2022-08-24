// SPDX-License-Identifier: MIT

pragma solidity ^0.8.7;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/** @title An ERC20 token to facilitate "free bets" in USD
 */
contract FreeBetToken is ERC20 {
    constructor(string memory name, string memory symbol) ERC20(name, symbol) {
        _mint(msg.sender, 100 * 10 ** 6);
    }

    function decimals() public view virtual override returns(uint8) {
        return 6;
    }
}