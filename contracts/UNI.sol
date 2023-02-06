// SPDX-License-Identifier: MIT
pragma solidity 0.8.6;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract UNI is ERC20 {
    constructor() ERC20("UNI", "UNI") {
        _mint(msg.sender, 100_000 ether);
    }
}
