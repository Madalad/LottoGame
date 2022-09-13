// SPDX-License-Identifier: MIT

pragma solidity ^0.8.7;

import "./LottoGame.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

error FreeBetContract__InsufficientBetAmount();

/** @title A contract to facilitate "free bets" for LottoGame.sol
 * @author OllieM26
 * @dev    This contract relies on a custom ERC20 token (FBT) with uncapped supply
 *         To allow users to bet on the main contract (LottoGame.sol) with FBT, this contract accepts
 *         FBT, sends USDC to the main contract and receives USDC back should that bet end up winning,
 *         paying out the bettor with FBT
 *         This contract must maintain a healthy FBT balance, enough to pay out any potential large
 *         wins
 *         FBT distribution to users must be done throught the distributeFbt() function in this
 *         contract, so that each users bet volume can be tracked for FBT => USDC redemption purposes
 *         Calling distributeFbt() to send a user FBT can only be called by the contract owner, and
 *         requires an equal amount of USDC to be sent from the owner to this contract.
 *         This is to guarantee that
 *         - there is enough USDC for each FBT bet to be placed (100FBT bet => 100USDC sent from this 
 *           contract to the main contract)
 *         - there is enough USDC for a user to redeem their FBT, no matter how much
 *           they may win (a large win would result in the entire USDC amount being sent to this contract
 *           from the main contract)
 */
contract FreeBetContract is Ownable {

    address private s_owner;
    LottoGame private lottoGame;
    ERC20 private FBT;
    ERC20 private USDC;

    /* Amount of $ value that must be staked with free bet token before swapping it for real usd */
    uint8 private s_betRequirementCoefficient;

    mapping(address => uint256) public betRequirementTotal;
    mapping(address => uint256) public betRequirementProgress;

    event FbtDistributed(
        address indexed recipient,
        uint256 amount
    );
    event FbtRedeemed(
        address indexed redeemer,
        uint256 amount
    );

    constructor(
        address _lottoGameAddress,
        address _freeBetTokenAddress,
        address _USDCAddress,
        uint8 _betRequirementCoefficient
        ) {
        s_owner = msg.sender;
        lottoGame = LottoGame(_lottoGameAddress);
        FBT = ERC20(_freeBetTokenAddress);
        USDC = ERC20(_USDCAddress);
        uint256 MAX_INT = 2 ** 256 - 1;
        USDC.approve(_lottoGameAddress, MAX_INT);
        s_betRequirementCoefficient = _betRequirementCoefficient;
    }

    /**
     * @notice Allows a user to place a free bet using FBT
     * @dev Contract accepts the FBT and transfers from its USDC balance to the main 
     *      contract (LottoGame.sol)
     *      User must approve FBT spending by this contract before calling this function
     *      This contract must be funded with sufficient USDC before free bets can be
     *      accepted
     * @param _betAmount Amount to be bet (FBT)
     */
    function bet(uint256 _betAmount) external {
        if (_betAmount == 0) {revert FreeBetContract__InsufficientBetAmount();}
        FBT.transferFrom(msg.sender, address(this), _betAmount);
        lottoGame.freeBet(_betAmount, msg.sender);
        betRequirementProgress[msg.sender] += _betAmount;
    }

    /**
     * @notice Called by the settleRound() function in the LottoGame contract when a free 
     *         bet is the winner
     * @dev This contract accepts the USDC winnings and pays out the winner with FBT
     * @param _winner Address of the winning user
     * @param _amountWon Amount of the pot won
     */
    function settleRound(address _winner, uint256 _amountWon) external {
        require(msg.sender == address(lottoGame), "Only the LottoGame contract can call this function.");
        FBT.transfer(_winner, _amountWon);
    }

    /**
     * @notice Contract owner gives FBT to specified recipient, and bet requirement state 
     *         variables are updated if necessary
     * @dev To only be called by the contract owner, this function should be the only means
     *      of distributing FBT, so that bet playthrough requirements are properly tracked
     *      Contract owner must first approve this contract to spend their USDC
     * @param _recipient Address of user to receive FBT
     * @param _amount Amount of FBT to send to the user
     */
    function distributeFbt(address _recipient, uint256 _amount) external onlyOwner {
        require(USDC.balanceOf(msg.sender) >= _amount, "Insufficient USDC balance.");
        require(FBT.balanceOf(address(this)) >= _amount, "Contract has insufficient FBT balance.");
        if (FBT.balanceOf(_recipient) == 0) {
            betRequirementTotal[_recipient] = s_betRequirementCoefficient * _amount;
            betRequirementProgress[_recipient] = 0;
        }
        FBT.transfer(_recipient, _amount);
        USDC.transferFrom(msg.sender, address(this), _amount);
        emit FbtDistributed(_recipient, _amount);
    }

    /**
     * @notice Allows a user to trade their FBT for USDC 1 to 1 if they have satisfied the bet
     *         playthrough requirement
     *         User must approve FBT spending by this contract before calling this function
     * @dev Accepts FBT, sends out USDC, and resets values in bet requirement mappings
     * @param _amount Amount of FBT to be redeemed
     */
    function redeemFbt(uint256 _amount) external {
        require(FBT.balanceOf(msg.sender) >= _amount, "Insufficient FBT balance.");
        require(betRequirementProgress[msg.sender] >= betRequirementTotal[msg.sender], "You cannot redeem your FBT yet.");
        FBT.transferFrom(msg.sender, address(this), _amount);
        USDC.transfer(msg.sender, _amount);
        betRequirementProgress[msg.sender] = 0;
        betRequirementTotal[msg.sender] = 0;
        emit FbtRedeemed(msg.sender, _amount);
    }

    /**
     * @notice To be called only during the refundBets() function in the main contract
     *         (LottoGame.sol)
     * @dev Refunds a single free bet
     *      Bet requirement progress is adjusted accordingly
     * @param _bettor Address whose bet is being refunded
     * @param _amount Size of the bet being refunded
     */
    function refundFreeBet(address _bettor, uint256 _amount) external {
        require(msg.sender == address(lottoGame), "Only the lottogame contract can call this function.");
        FBT.transfer(_bettor, _amount);
        betRequirementProgress[_bettor] -= _amount;
    }

    function withdrawUsdc() external onlyOwner {
        USDC.transfer(msg.sender, USDC.balanceOf(address(this)));
    }

    function withdrawFbt() external onlyOwner {
        FBT.transfer(msg.sender, FBT.balanceOf(address(this)));
    }

    function setBetRequirementCoefficient(uint8 _newBetRequirementCoefficient) external onlyOwner {
        s_betRequirementCoefficient = _newBetRequirementCoefficient;
    }

    function getUsdcBalance() external view returns(uint256) {
        return USDC.balanceOf(address(this));
    }

    function getFbtBalance() external view returns(uint256) {
        return FBT.balanceOf(address(this));
    }

    function getBetRequirementCoefficient() external view returns(uint256) {
        return s_betRequirementCoefficient;
    }
}