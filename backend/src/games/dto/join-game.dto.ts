import { IsString, Length } from 'class-validator';

export class JoinGameDto {
  @IsString()
  @Length(6, 6)
  code!: string;
}
