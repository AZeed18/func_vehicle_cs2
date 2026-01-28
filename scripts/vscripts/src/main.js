import { Instance as i } from "cs_script/point_script";
import {
	ZEROVECTOR,
	Vehicle,
	Seat,
	findYaw
} from "./core";

i.SetThink(() => {
	while (Seat.newOccupantsQueue.length){
		const seat = Seat.newOccupantsQueue.pop();
		if (!seat.isDriver())
			seat.occupant.SetParent(seat.seatIn);
		seat.teleportOccupant();
	}

	for (const vec of Vehicle.occupiedVecs)
		vec.updateDamage();

	for (const [_, seat] of Seat.occupiedSeats){
		const seatInAngles = seat.seatIn.GetAbsAngles();
		const undrivable = Math.abs(seatInAngles.pitch) > 45 || Math.abs(seatInAngles.roll) > 40;

		// if driver, detect his movement direction to move vehicle before teleporting him
		if (seat.isDriver()){
			// reset vehicle
			seat.vehicle.drive(false,false,false,false);

			// if vehicle is undrivable, use parenting to make dirver orientation follow vehicle angles
			if (undrivable && seat.occupant.GetParent() == undefined){
				seat.occupant.SetParent(seat.seatIn);
				seat.occupant.Teleport(null, {yaw: seat.occupant.GetEyeAngles().yaw, pitch: seat.occupant.GetEyeAngles().pitch, roll: 0})
			}

			// if drivable, drive
			if (!undrivable){
				seat.occupant.SetParent(null);

				// get driver velocity
				const drvVelVec = seat.occupant.GetAbsVelocity();

				// if driver moved
				if ((drvVelVec.x != 0 || drvVelVec.y != 0)){
					// find driver movement yaw relative to his eyes yaw
					const drvYaw = seat.occupant.GetEyeAngles().yaw;
					const drvVelYaw = findYaw(drvVelVec);
					const drvRelYaw = (drvVelYaw - drvYaw + 360) % 360;

					// determine movement direction relative to driver's direction to activate the right thruster(s) (https://developer.valvesoftware.com/wiki/QAngle)
					// forward
					if ((drvRelYaw > 0 && drvRelYaw < 0 + Vehicle.DEVIATION) || (drvRelYaw > 360 - Vehicle.DEVIATION && drvRelYaw < 360))
						seat.vehicle.drive(true ,false,false,false)
					// backward
					else if (drvRelYaw > 180 - Vehicle.DEVIATION && drvRelYaw < 180 + Vehicle.DEVIATION)
						seat.vehicle.drive(false,true ,false,false)
					// left
					else if (drvRelYaw > 90 - Vehicle.DEVIATION && drvRelYaw < 90 + Vehicle.DEVIATION)
						seat.vehicle.drive(false,false,false,true )
					// right
					else if (drvRelYaw > 270 - Vehicle.DEVIATION && drvRelYaw < 270 + Vehicle.DEVIATION)
						seat.vehicle.drive(false,false,true ,false)
					// forward left
					else if (drvRelYaw > 45 - Vehicle.DEVIATION && drvRelYaw < 45 + Vehicle.DEVIATION)
						seat.vehicle.drive(true ,false,false,true )
					// forward right
					else if (drvRelYaw > 315 - Vehicle.DEVIATION && drvRelYaw < 315 + Vehicle.DEVIATION)
						seat.vehicle.drive(true ,false,true ,false)
					// backward left
					else if (drvRelYaw > 135 - Vehicle.DEVIATION && drvRelYaw < 135 + Vehicle.DEVIATION)
						seat.vehicle.drive(false,true ,false,true )
					// backward right
					else if	(drvRelYaw > 225 - Vehicle.DEVIATION && drvRelYaw < 225 + Vehicle.DEVIATION)
						seat.vehicle.drive(false,true ,true ,false)
				}
			}
		}

		const newOrigin = seat.seatIn.GetAbsOrigin();
		newOrigin.z += 2;
		if (seat.isDriver() && !undrivable){
			seat.floor.Teleport(seat.seatIn.GetAbsOrigin(), ZEROVECTOR, null);
			seat.occupant.Teleport(newOrigin, null, ZEROVECTOR);
		}
		else {
			seat.floor.Teleport(seat.seatIn.GetAbsOrigin(), seatInAngles, null);
			seat.occupant.Teleport(newOrigin, null, null);
		}

		seat.damage();
	}
	i.SetNextThink(i.GetGameTime());
});
i.SetNextThink(i.GetGameTime());
