import { IsString, IsNotEmpty } from 'class-validator';

export class CreateSessionDto {
  @IsString()
  @IsNotEmpty()
  ticketId: string;
}

export class TransferToAgentDto {
  @IsString()
  @IsNotEmpty()
  urgency: 'URGENT' | 'NON_URGENT';
}

