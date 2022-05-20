// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.6;

import "forge-std/Test.sol";
import {DelegateVouch} from "contracts/DelegateVouch.sol";

contract DelegateVouchTest is Test {
    address public aelinCouncil = address(0xfdbdb06109CD25c7F485221774f5f96148F1e235);
    DelegateVouch public delegateVouchAddress;

    event AddDelegateVouch(address indexed delegate);
    event RemoveDelegateVouch(address indexed delegate);

    function setUp() public {
        delegateVouchAddress = new DelegateVouch(aelinCouncil);
    }

    /*//////////////////////////////////////////////////////////////
                        addDelegateVouch
    //////////////////////////////////////////////////////////////*/

    function testFuzzAddDelegateVouch(address delegate) public {
        vm.prank(aelinCouncil);
        vm.expectEmit(true, false, false, true);
        emit AddDelegateVouch(delegate);
        DelegateVouch(delegateVouchAddress).addDelegateVouch(delegate);
    }

    function testFuzzAddDelegateVouchOnlyOwner(address delegate) public {
        vm.prank(delegate);
        vm.expectRevert("Only the contract owner may perform this action");
        DelegateVouch(delegateVouchAddress).addDelegateVouch(delegate);
    }

    /*//////////////////////////////////////////////////////////////
                        removeDelegateVouch
    //////////////////////////////////////////////////////////////*/

    function testFuzzRemoveDelegateVouch(address delegate) public {
        vm.prank(aelinCouncil);
        vm.expectEmit(true, false, false, true);
        emit RemoveDelegateVouch(delegate);
        DelegateVouch(delegateVouchAddress).removeDelegateVouch(delegate);
    }

    function testFuzzRemoveDelegateVouchOnlyOwner(address delegate) public {
        vm.prank(delegate);
        vm.expectRevert("Only the contract owner may perform this action");
        DelegateVouch(delegateVouchAddress).removeDelegateVouch(delegate);
    }
}